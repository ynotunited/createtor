/**
 * Content Security Policy construction.
 *
 * The app is deliberately same-origin: the only third-party script is Cloudflare
 * Turnstile, and only on the `/auth` document. Everything else (Supabase, AI
 * gateways, Stripe/PayPal) is either a `connect-src` fetch or a full-page
 * redirect, never an embedded script.
 *
 * The policy is therefore strict by default (`default-src 'self'`) and widens
 * *only* for the routes that need it:
 *   - `challenges.cloudflare.com` is allowed in script/frame/connect on `/auth`.
 *   - Supabase (auth + storage) is allowed in `connect-src`/`img-src`/`media-src`
 *     everywhere the app runs, since every dashboard page talks to it.
 *
 * The header is emitted report-only until `CSP_ENFORCE` is set, so a missed
 * origin is observed (via the `csp-report` endpoint) rather than breaking the
 * page. Set `CSP_ENFORCE=true` to enforce.
 */

import { projectRefFromUrl } from "@/lib/env.server";

export type CspInput = {
  pathname: string;
  env?: Record<string, string | undefined>;
};

const TURNSTILE = "https://challenges.cloudflare.com";

/** Lovable preview zones the app is embedded in during development. */
const FRAME_ANCESTORS = [
  "'self'",
  "https://*.lovable.dev",
  "https://*.lovableproject.com",
  "https://*.lovableproject-dev.com",
  "https://*.lovable.app",
  "https://*.gpt-eng.com",
  "https://*.gptengineer.run",
];

/**
 * Routes where an external script (Turnstile) is required. Kept as an explicit
 * allowlist so a new route can never silently gain third-party script access.
 */
const TURNSTILE_ROUTES = new Set(["/auth"]);

export function routeAllowsTurnstile(pathname: string): boolean {
  const normalised = pathname.replace(/\/+$/, "") || "/";
  return TURNSTILE_ROUTES.has(normalised);
}

/** The Supabase origin from the public env (host only, no path). */
function supabaseOrigin(env: Record<string, string | undefined>): string | null {
  const raw = (env["VITE_SUPABASE_URL"] || env["SUPABASE_URL"] || "").trim();
  if (!raw) return null;
  if (!projectRefFromUrl(raw)) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function buildCsp(input: CspInput): string {
  const env = input.env ?? process.env;
  const allowTurnstile = routeAllowsTurnstile(input.pathname);
  const supabase = supabaseOrigin(env);

  const connect = ["'self'", TURNSTILE];
  const img = ["'self'", "data:", "blob:"];
  const media = ["'self'", "blob:", "data:"];

  // Supabase is reached from the browser for auth, data and storage.
  if (supabase) {
    connect.push(supabase, `${supabase.replace("https://", "wss://")}`);
    img.push(supabase);
    media.push(supabase);
  }

  const script = ["'self'"];
  const frame = ["'self'"];
  if (allowTurnstile) {
    script.push(TURNSTILE);
    frame.push(TURNSTILE);
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": FRAME_ANCESTORS,
    "script-src": script,
    // React inline style props and the chart component emit inline CSS.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": img,
    "media-src": media,
    "font-src": ["'self'"],
    "connect-src": connect,
    "frame-src": frame,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "report-uri": ["/api/csp-report"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([name, values]) =>
      values.length === 0 ? name : `${name} ${values.filter(Boolean).join(" ")}`,
    )
    .join("; ");
}

/** The header name for the current mode (report-only until enforced). */
export function cspHeaderName(env: Record<string, string | undefined> = process.env): string {
  const enforce = (env["CSP_ENFORCE"] ?? "").toLowerCase();
  return enforce === "1" || enforce === "true" || enforce === "yes"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}
