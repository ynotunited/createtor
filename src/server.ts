import "./lib/error-capture";

import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { classifyAdminPath, resolveAdminPath } from "./lib/admin-path.server";
import { buildCsp, cspHeaderName } from "./lib/csp.server";
import { assertSafeDatabaseTarget, environmentBanner } from "./lib/env.server";
import { captureIssue } from "./lib/issues.server";
import { clientIpFromHeaders, log, userAgentFromHeaders } from "./lib/logger.server";
import { hashIp } from "./lib/redact";
import { recordSecurityEvent } from "./lib/security-events.server";

// Fail fast (before serving a single request) if a non-production build is wired
// to the production database. Production boots unaffected.
assertSafeDatabaseTarget();
console.log(environmentBanner());

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

// Baseline security headers applied to every response. The Content-Security-
// Policy is built per-request (see csp.server.ts) so it can be strict everywhere
// and widen only for the `/auth` document that loads Cloudflare Turnstile. The
// other headers here are static.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function securityHeadersFor(pathname: string): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    [cspHeaderName()]: buildCsp({ pathname }),
  };
}

function withSecurityHeaders(response: Response, pathname: string): Response {
  const headers = securityHeadersFor(pathname);
  try {
    for (const [key, value] of Object.entries(headers)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  } catch {
    // Immutable responses (e.g. redirects) expose read-only headers — rebuild.
    const rebuilt = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      if (!rebuilt.has(key)) rebuilt.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: rebuilt,
    });
  }
}

type WorkerContext = { waitUntil?: (promise: Promise<unknown>) => void };

/**
 * Runs a best-effort task without delaying the response. Cloudflare's `waitUntil`
 * keeps the isolate alive until the promise settles; without it (local dev,
 * tests) the promise still starts immediately and is simply not awaited.
 */
function background(ctx: unknown, promise: Promise<unknown>): void {
  const waitUntil = (ctx as WorkerContext | undefined)?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil.call(ctx, promise);
    return;
  }
  void promise;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/**
 * Redirects plaintext requests to HTTPS. Cloudflare terminates TLS and reports
 * the original scheme in `x-forwarded-proto`; fall back to the URL protocol when
 * the header is absent (local dev). Localhost is exempt so `npm run dev` works.
 */
function enforceHttps(request: Request, ctx: unknown): Response | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (isLocalHost(url.hostname)) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  if (proto === "https") return null;

  url.protocol = "https:";
  const location = url.toString();
  background(
    ctx,
    recordSecurityEvent("https_redirect", {
      method: request.method,
      path: url.pathname,
      ip: clientIpFromHeaders(request.headers),
    }),
  );
  return new Response(null, { status: 308, headers: { Location: location } });
}

const SKIP_LOG_PREFIXES = ["/assets/", "/@vite/", "/node_modules/", "/.well-known/"];
const SKIP_LOG_PATHS = new Set(["/favicon.ico", "/robots.txt"]);

function shouldLogRequest(pathname: string): boolean {
  if (SKIP_LOG_PATHS.has(pathname)) return false;
  return !SKIP_LOG_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Logs request outcome. 5xx = server error, 401/403 = denied auth, 429 = rate
 * limited, other 4xx = client error. Query strings are intentionally excluded
 * so tokens/params never reach the log drain. The client IP is stored only as a
 * salted pseudonym, so the drain never carries a raw address.
 */
async function logRequest(
  request: Request,
  response: Response,
  startedAt: number,
  ctx: unknown,
): Promise<void> {
  try {
    const { pathname } = new URL(request.url);
    if (!shouldLogRequest(pathname)) return;

    const ipHash = await hashIp(clientIpFromHeaders(request.headers), process.env["IP_HASH_SALT"]);
    const fields = {
      method: request.method,
      path: pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ip: ipHash,
      ua: userAgentFromHeaders(request.headers),
    };

    if (response.status >= 500) log("error", "api.error", fields);
    else if (response.status === 401 || response.status === 403) {
      background(ctx, recordSecurityEvent("auth_denied", fields));
    } else if (response.status === 429) {
      background(ctx, recordSecurityEvent("rate_limited", fields));
    } else if (response.status >= 400) log("warn", "api.client_error", fields);
    else log("info", "api.request", fields);
  } catch {
    // Logging must never affect the response.
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const startedAt = Date.now();
    const pathname = safePathname(request);

    const redirect = enforceHttps(request, ctx);
    if (redirect) return withSecurityHeaders(redirect, pathname);

    const adminGate = applyAdminPathGate(request, ctx);
    if (adminGate && "response" in adminGate)
      return withSecurityHeaders(adminGate.response, pathname);
    const effectiveRequest = adminGate && "request" in adminGate ? adminGate.request : request;

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(effectiveRequest, env, ctx);
      const finalResponse = withSecurityHeaders(
        await normalizeCatastrophicSsrResponse(response),
        pathname,
      );
      // logRequest is async (it hashes the client IP); run it in the background
      // so logging never delays the response.
      background(ctx, logRequest(request, finalResponse, startedAt, ctx));
      return finalResponse;
    } catch (error) {
      background(
        ctx,
        (async () => {
          try {
            const ipHash = await hashIp(
              clientIpFromHeaders(request.headers),
              process.env["IP_HASH_SALT"],
            );
            log("error", "api.unhandled", {
              method: request.method,
              path: pathname,
              durationMs: Date.now() - startedAt,
              ip: ipHash,
              ua: userAgentFromHeaders(request.headers),
              error: describeError(error),
            });
          } catch {
            // Logging must never affect the response.
          }
        })(),
      );
      background(ctx, captureIssue(error, { kind: "server", path: pathname }));
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        pathname,
      );
    }
  },
};

function safePathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}

const ADMIN_PATH = resolveAdminPath();

/**
 * Hides the admin console behind a secret first path segment.
 *
 * The router's route tree lives at `/admin`, but if `ADMIN_PATH` is configured
 * the public URL becomes `/<ADMIN_PATH>/*` — rewritten here so the router still
 * matches `/admin/*`. The literal `/admin` is answered with a plain 404 so a
 * probe cannot confirm the console exists. Returns a 404 response to short
 * circuit the request, a rewritten request to continue, or null to pass through.
 */
function applyAdminPathGate(
  request: Request,
  ctx: unknown,
): { response: Response } | { request: Request } | null {
  if (!ADMIN_PATH || ADMIN_PATH === "admin") return null;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  const decision = classifyAdminPath(url.pathname, ADMIN_PATH);
  if (decision.kind === "pass") return null;

  if (decision.kind === "not_found") {
    background(
      ctx,
      recordSecurityEvent("admin_decoy_probe", {
        method: request.method,
        path: url.pathname,
        ip: clientIpFromHeaders(request.headers),
      }),
    );
    return {
      response: new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    };
  }

  url.pathname = decision.pathname;
  return { request: new Request(url.toString(), request) };
}
