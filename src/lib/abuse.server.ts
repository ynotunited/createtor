/**
 * Edge abuse protection: per-IP rate limiting for every server-handled request.
 *
 * Layered on top of the per-user limits in `rate-limit.server.ts`. This layer
 * exists because a single IP can drive many requests without ever
 * authenticating: a bot scraping pages, a script hammering the image route, or
 * a farm creating accounts and draining one IP's budget. Keys are
 * `abuse:<scope>:<ip>` in the shared `rate_limits` table, so limits are global
 * across Worker isolates.
 *
 * Fails open: if the limiter or database is unavailable the request proceeds
 * (the failure is logged), so an outage cannot take the whole site down.
 */

import { clientIpFromHeaders } from "@/lib/logger.server";
import { consumeRateLimit } from "@/lib/rate-limit-core.server";
import { hashIp } from "@/lib/redact";
import { recordSecurityEvent } from "@/lib/security-events.server";

export type AbuseBucket = { limit: number; windowSeconds: number };

/**
 * Per-IP ceilings. Deliberately generous enough to never bother a person
 * clicking around the dashboard, tight enough to stop scripted hammering.
 */
export const ABUSE_LIMITS = {
  /** SSR document + data requests from a browser. */
  page: { limit: 300, windowSeconds: 60 },
  /** `/api/*` routes, excluding verified webhooks and health checks. */
  api: { limit: 120, windowSeconds: 60 },
  /** TanStack server-function calls, including AI and media generation. */
  serverFn: { limit: 180, windowSeconds: 60 },
} satisfies Record<string, AbuseBucket>;

export type AbuseScope = keyof typeof ABUSE_LIMITS;

export type AbuseDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function clientIp(request: Request): string | null {
  return clientIpFromHeaders(request.headers);
}

/**
 * Increments the caller IP's counter for `scope` and reports whether the
 * request may proceed. Denials are recorded as security events.
 */
export async function checkAbuseLimit(
  scope: AbuseScope,
  ip: string | null,
): Promise<AbuseDecision> {
  const { limit, windowSeconds } = ABUSE_LIMITS[scope];
  // Pseudonymise the IP before it becomes a persisted limiter key. The same
  // address still maps to the same bucket, so per-IP limits are unchanged.
  const subject = (await hashIp(ip, process.env["IP_HASH_SALT"])) ?? "unknown";
  const decision = await consumeRateLimit(`abuse:${scope}:${subject}`, limit, windowSeconds);

  // Fail open on limiter or database errors.
  if (decision !== "denied") return { allowed: true };

  await recordSecurityEvent("rate_limited", {
    scope,
    ip,
    limit,
    windowSeconds,
  });
  return { allowed: false, retryAfterSeconds: windowSeconds };
}

/**
 * Resolves the bucket for a request, or null when it must not be limited.
 * Provider webhooks are exempt (they authenticate by signature and are retried
 * by the provider) and the health endpoint stays unrestricted.
 */
export function abuseScopeFor(
  handlerType: "serverFn" | "router",
  pathname: string,
): AbuseScope | null {
  if (handlerType === "serverFn") return "serverFn";
  if (pathname.startsWith("/api/")) {
    // Health exists in both the legacy and `/api/v1` shapes.
    if (pathname === "/api/health" || pathname === "/api/v1/health") return null;
    if (pathname.startsWith("/api/payments/")) return null;
    return "api";
  }
  return "page";
}
