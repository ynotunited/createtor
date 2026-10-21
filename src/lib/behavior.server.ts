/**
 * Identity-aware authentication abuse protection and behavioural detection.
 *
 * The per-IP request limiter (`abuse.server.ts`) stops a single host hammering
 * the site, but it cannot see intent: credential stuffing rotates IPs, and
 * password guessing targets one account from many hosts. This module adds two
 * things the IP layer cannot:
 *
 *   1. Identity-keyed attempt limits — counters keyed by a SHA-256 hash of the
 *      email (never the raw address) so one account cannot be probed repeatedly
 *      regardless of source IP, and one IP cannot mass-create accounts.
 *   2. Failure-based lockouts — a burst of failed attempts locks the identity
 *      and the source IP for a cooldown, and repeated WAF violations lock the
 *      IP. Lockouts are read with `peekRateLimit` (no increment) so a legitimate
 *      attempt never raises the failure count.
 *
 * Counters live in the shared limiter (Redis when configured, else Postgres),
 * so they are global across Worker isolates. All checks fail open: a limiter
 * outage must not lock legitimate users out.
 */

import { getRequest } from "@tanstack/react-start/server";

import { clientIpFromHeaders } from "@/lib/logger.server";
import { clearRateLimit, consumeRateLimit, peekRateLimit } from "@/lib/rate-limit-core.server";
import { hashIp } from "@/lib/redact";
import { recordSecurityEvent } from "@/lib/security-events.server";

export type AuthKind = "signin" | "signup" | "reset" | "otp";

type AttemptBuckets = { ipLimit: number; ipWindow: number; idLimit: number; idWindow: number };

/** Per-identity and per-IP attempt ceilings. Tune here. */
export const AUTH_ATTEMPT_LIMITS: Record<AuthKind, AttemptBuckets> = {
  signin: { ipLimit: 20, ipWindow: 300, idLimit: 8, idWindow: 300 },
  signup: { ipLimit: 6, ipWindow: 3600, idLimit: 3, idWindow: 3600 },
  reset: { ipLimit: 8, ipWindow: 3600, idLimit: 4, idWindow: 3600 },
  otp: { ipLimit: 10, ipWindow: 600, idLimit: 5, idWindow: 900 },
};

/** Consecutive failed attempts that trigger a cooldown lockout. */
export const FAILURE_LOCKOUT = {
  ip: { limit: 12, windowSeconds: 900 },
  identity: { limit: 6, windowSeconds: 900 },
};

/** Repeated malicious requests that trigger an IP cooldown. */
export const ABUSE_BLOCK = { ipLimit: 20, ipWindow: 600 };

const FAIL_COUNT_CEILING = 1_000_000; // counters only count; the ceiling never trips

/**
 * Salted pseudonym of an IP for use inside limiter keys. Keys are persisted in
 * `rate_limits`, so the raw address must never appear in them. The same IP still
 * maps to the same key, so per-IP lockouts behave identically.
 */
async function hashedIpKey(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return hashIp(ip, process.env["IP_HASH_SALT"]);
}

export type AuthDecision =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" | "locked"; retryAfterSeconds: number };

export type IpBlock = { retryAfterSeconds: number };

function normaliseEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Stable, non-reversible key for an email so lockouts can key on identity
 * without ever persisting the address in a counter name.
 */
export async function hashIdentity(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort client IP for the current request (may be null in tests). */
export function currentClientIp(): string | null {
  try {
    const request = getRequest();
    return request ? clientIpFromHeaders(request.headers) : null;
  } catch {
    return null;
  }
}

async function identityHash(email: string | null | undefined): Promise<string | null> {
  const value = normaliseEmail(email);
  return value ? hashIdentity(value) : null;
}

/**
 * Decides whether an auth attempt may proceed. Checks identity + IP lockouts
 * first (read-only), then increments the attempt counters. Returns a decision
 * rather than throwing so callers can surface a friendly message.
 */
export async function guardAuthAttempt(input: {
  kind: AuthKind;
  email?: string | null;
  ip?: string | null;
}): Promise<AuthDecision> {
  const ip = input.ip ?? currentClientIp();
  const ipKey = await hashedIpKey(ip);
  const idHash = await identityHash(input.email);

  // 1. Read-only lockout checks.
  if (ipKey) {
    const fails = await peekRateLimit(`auth.fail.ip.${ipKey}`, FAILURE_LOCKOUT.ip.windowSeconds);
    if (fails !== null && fails >= FAILURE_LOCKOUT.ip.limit) {
      await recordSecurityEvent("auth_locked", { kind: input.kind, ip, reason: "ip" });
      return {
        allowed: false,
        reason: "locked",
        retryAfterSeconds: FAILURE_LOCKOUT.ip.windowSeconds,
      };
    }
  }
  if (idHash) {
    const fails = await peekRateLimit(
      `auth.fail.id.${idHash}`,
      FAILURE_LOCKOUT.identity.windowSeconds,
    );
    if (fails !== null && fails >= FAILURE_LOCKOUT.identity.limit) {
      await recordSecurityEvent("auth_locked", { kind: input.kind, ip, reason: "identity" });
      return {
        allowed: false,
        reason: "locked",
        retryAfterSeconds: FAILURE_LOCKOUT.identity.windowSeconds,
      };
    }
  }

  // 2. Attempt ceilings (increment).
  const buckets = AUTH_ATTEMPT_LIMITS[input.kind];
  if (ipKey) {
    const decision = await consumeRateLimit(
      `auth.try.${input.kind}.ip.${ipKey}`,
      buckets.ipLimit,
      buckets.ipWindow,
    );
    if (decision === "denied") {
      await recordSecurityEvent("auth_rate_limited", { kind: input.kind, ip, scope: "ip" });
      return { allowed: false, reason: "rate_limited", retryAfterSeconds: buckets.ipWindow };
    }
  }
  if (idHash) {
    const decision = await consumeRateLimit(
      `auth.try.${input.kind}.id.${idHash}`,
      buckets.idLimit,
      buckets.idWindow,
    );
    if (decision === "denied") {
      await recordSecurityEvent("auth_rate_limited", { kind: input.kind, ip, scope: "identity" });
      return { allowed: false, reason: "rate_limited", retryAfterSeconds: buckets.idWindow };
    }
  }

  return { allowed: true };
}

/**
 * Records the outcome of an attempt so the lockout counters reflect reality.
 * On success the failure counters are cleared (the requester proved control of
 * the identity); on failure both identity and IP counters advance.
 */
export async function recordAuthOutcome(input: {
  kind: AuthKind;
  email?: string | null;
  ip?: string | null;
  success: boolean;
}): Promise<void> {
  const ip = input.ip ?? currentClientIp();
  const ipKey = await hashedIpKey(ip);
  const idHash = await identityHash(input.email);

  if (input.success) {
    if (idHash) await clearRateLimit(`auth.fail.id.${idHash}`);
    if (ipKey) await clearRateLimit(`auth.fail.ip.${ipKey}`);
    return;
  }

  if (ipKey) {
    await consumeRateLimit(
      `auth.fail.ip.${ipKey}`,
      FAIL_COUNT_CEILING,
      FAILURE_LOCKOUT.ip.windowSeconds,
    );
  }
  if (idHash) {
    await consumeRateLimit(
      `auth.fail.id.${idHash}`,
      FAIL_COUNT_CEILING,
      FAILURE_LOCKOUT.identity.windowSeconds,
    );
  }
  await recordSecurityEvent("auth_failed", { kind: input.kind, ip });
}

/** Advances a non-auth abuse signal (e.g. a WAF violation) for rollout blocking. */
export async function recordAbuseSignal(signal: string, ip: string | null): Promise<void> {
  const ipKey = await hashedIpKey(ip);
  if (!ipKey) return;
  await consumeRateLimit(`abuse.${signal}.ip.${ipKey}`, FAIL_COUNT_CEILING, ABUSE_BLOCK.ipWindow);
}

/**
 * Whether the source IP is currently in a cooldown from failed logins or
 * repeated malicious requests. Returns null when not blocked.
 */
export async function isIpBlocked(ip: string | null): Promise<IpBlock | null> {
  const ipKey = await hashedIpKey(ip);
  if (!ipKey) return null;
  const [authFail, abuseHits] = await Promise.all([
    peekRateLimit(`auth.fail.ip.${ipKey}`, FAILURE_LOCKOUT.ip.windowSeconds),
    peekRateLimit(`abuse.waf.ip.${ipKey}`, ABUSE_BLOCK.ipWindow),
  ]);
  if (authFail !== null && authFail >= FAILURE_LOCKOUT.ip.limit) {
    return { retryAfterSeconds: FAILURE_LOCKOUT.ip.windowSeconds };
  }
  if (abuseHits !== null && abuseHits >= ABUSE_BLOCK.ipLimit) {
    return { retryAfterSeconds: ABUSE_BLOCK.ipWindow };
  }
  return null;
}
