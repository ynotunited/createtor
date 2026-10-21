import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { abuseScopeFor, checkAbuseLimit, clientIp } from "@/lib/abuse.server";
import { isIpBlocked, recordAbuseSignal } from "@/lib/behavior.server";
import { captureIssue } from "@/lib/issues.server";
import { recordSecurityEvent } from "@/lib/security-events.server";
import { inspectRequest } from "@/lib/waf.server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware({ type: "request" }).server(async ({ pathname, next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    await captureIssue(error, { kind: "server", path: pathname });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Per-IP abuse protection for every request the server handles (SSR pages, API
// routes and server functions, which include AI and media generation). Runs
// after CSRF so cross-site requests are rejected before spending limiter budget.
// Never throws: on any failure it lets the request through.
const abuseGuard = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, handlerType, next }) => {
    const scope = abuseScopeFor(handlerType, pathname);
    if (!scope) return next();

    try {
      const decision = await checkAbuseLimit(scope, clientIp(request));
      if (!decision.allowed) {
        return new Response("Too many requests. Please slow down and try again shortly.", {
          status: 429,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "retry-after": String(decision.retryAfterSeconds),
          },
        });
      }
    } catch {
      // Abuse protection must never break a legitimate request.
    }
    return next();
  },
);

// Gateway enforcement + web application firewall. Runs after the per-IP abuse
// limiter so cheap rejections happen first. Blocks requests from IPs in a
// cooldown (too many failed logins or repeated malicious requests) and rejects
// high-signal attack patterns, disallowed methods and oversized bodies before
// they reach a handler. Never throws: on any internal failure it lets the
// request through.
const securityGuard = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, handlerType, next }) => {
    if (pathname === "/api/health" || pathname === "/api/v1/health") return next();
    const ip = clientIp(request);
    // The blocklist costs two limiter reads, so only consult it for the
    // authenticated attack surface (server functions and API routes), not for
    // every static/SSR page request.
    const checkBlock = handlerType === "serverFn" || pathname.startsWith("/api/");

    try {
      if (checkBlock) {
        const blocked = await isIpBlocked(ip);
        if (blocked) {
          return new Response("Temporarily blocked. Please try again later.", {
            status: 403,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "retry-after": String(blocked.retryAfterSeconds),
            },
          });
        }
      }

      const verdict = inspectRequest(request);
      if (verdict.action === "block") {
        await recordAbuseSignal("waf", ip);
        await recordSecurityEvent("waf_block", {
          reason: verdict.reason,
          path: pathname,
          ip,
          method: request.method,
          ua: request.headers.get("user-agent"),
        });
        return new Response("Request blocked.", {
          status: verdict.status,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    } catch {
      // Security checks must never break a legitimate request.
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware, abuseGuard, securityGuard],
}));
