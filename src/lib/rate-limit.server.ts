/**
 * Distributed, database-backed fixed-window rate limiting.
 *
 * Counters live in Postgres (`check_rate_limit`), so the limit is shared across
 * every Worker isolate and region rather than being reset per cold start. Keys
 * are scoped per user so one account cannot exhaust another's budget.
 *
 * The limiter is a burst/abuse guard layered *on top of* credits and auth; it is
 * not the billing control. On a limiter outage it fails open (the call proceeds)
 * so a Postgres blip cannot take down AI for everyone, and logs the failure.
 */

import { consumeRateLimit } from "@/lib/rate-limit-core.server";
import { hashIp } from "@/lib/redact";
import { recordSecurityEvent } from "@/lib/security-events.server";

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type RateLimitBucket = { limit: number; windowSeconds: number };

/** Rough IPv4/IPv6 shape test: used only to decide whether to pseudonymise. */
function looksLikeIp(value: string): boolean {
  if (value.includes(":")) return true; // IPv6
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Per-user limits. Tune here; every call site reads from this table. */
export const RATE_LIMITS = {
  ai: { limit: 30, windowSeconds: 60 },
  image: { limit: 30, windowSeconds: 60 },
  voice: { limit: 10, windowSeconds: 60 },
  video: { limit: 6, windowSeconds: 60 },
} satisfies Record<string, RateLimitBucket>;

export type RateLimitKind = keyof typeof RATE_LIMITS;

/**
 * Increments the caller's counter for `kind` and throws {@link RateLimitError}
 * when the limit is exceeded. Safe to call at the top of any expensive handler.
 */
export async function enforceRateLimit(kind: RateLimitKind, userId: string): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[kind];
  const decision = await consumeRateLimit(`${kind}:${userId}`, limit, windowSeconds);

  // Fail open: a limiter/database outage must not take down the product.
  if (decision === "error") return;

  if (decision === "denied") {
    await recordSecurityEvent("rate_limited", {
      bucket: kind,
      userId,
      windowSeconds,
      limit,
    });
    throw new RateLimitError(
      `Too many requests. Please wait up to ${windowSeconds} seconds and try again.`,
      windowSeconds,
    );
  }
}

/** Admin-console buckets. Deliberately tight; the console is high privilege. */
export const ADMIN_RATE_LIMITS = {
  /** Privilege-escalation bootstrap attempts (per IP). */
  adminClaim: { limit: 5, windowSeconds: 3600 },
  /** General admin server-function calls (per user). */
  adminAction: { limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitBucket>;

export type AdminRateLimitKind = keyof typeof ADMIN_RATE_LIMITS;

/**
 * Admin-surface limiter that fails *closed*: unlike {@link enforceRateLimit},
 * a limiter outage denies the request rather than allowing it, because the admin
 * console is the highest-privilege surface in the product. Applies to the
 * bootstrap `claimAdmin` path and to sensitive admin actions.
 */
export async function enforceAdminRateLimit(
  kind: AdminRateLimitKind,
  subject: string,
): Promise<void> {
  const { limit, windowSeconds } = ADMIN_RATE_LIMITS[kind];
  // Pseudonymise an IP-shaped subject before it becomes a limiter key (Postgres
  // / Redis) or a security-event field. A UUID subject (abs user) is left as-is.
  const safeSubject = looksLikeIp(subject)
    ? ((await hashIp(subject, process.env["IP_HASH_SALT"])) ?? "unknown")
    : subject;
  const decision = await consumeRateLimit(`admin.${kind}:${safeSubject}`, limit, windowSeconds);

  if (decision === "denied") {
    await recordSecurityEvent("rate_limited", {
      bucket: kind,
      subject: safeSubject,
      windowSeconds,
      limit,
      failClosed: true,
    });
    throw new RateLimitError(
      `Too many admin requests. Please wait up to ${windowSeconds} seconds and try again.`,
      windowSeconds,
    );
  }

  if (decision === "error") {
    // Fail closed: refuse rather than let an unbounded flow through the console.
    await recordSecurityEvent("rate_limited", {
      bucket: kind,
      subject: safeSubject,
      failClosed: true,
      reason: "limiter_unavailable",
    });
    throw new RateLimitError(
      "Admin access is temporarily unavailable. Please try again shortly.",
      windowSeconds,
    );
  }
}
