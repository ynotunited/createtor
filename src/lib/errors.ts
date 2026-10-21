/**
 * Turns any thrown value into something safe and useful to show a person:
 * a plain-language message, a short reference to quote to support, and the
 * technical detail kept aside (never rendered by default).
 *
 * Raw Supabase/Postgres/network strings must not reach the UI: they are noisy
 * for users and leak schema and infrastructure detail. `toUserMessage` maps the
 * common failure shapes to actionable copy and passes through the app's own
 * deliberate, already-friendly messages (e.g. "You do not have access to this
 * workspace.").
 */

export type UserFacingError = {
  message: string;
  reference: string;
  technical: string;
};

const GENERIC = "Something went wrong. Please try again.";

const NETWORK_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "fetch failed",
  "err_network",
  "err_internet",
  "econnrefused",
  "the internet connection appears to be offline",
];

const TIMEOUT_PATTERNS = ["timeout", "timed out", "aborted", "the operation was aborted"];

const AUTH_PATTERNS = [
  "jwt expired",
  "invalid jwt",
  "jwt is expired",
  "not authenticated",
  "no authorization",
  "missing authorization",
  "session expired",
  "refresh token",
  "invalid claim",
  "401",
];

const FORBIDDEN_PATTERNS = [
  "row-level security",
  "row level security",
  "permission denied",
  "not authorized",
  "unauthorized",
  "forbidden",
  "403",
  "you do not have access",
  "do not have access",
  "not permitted",
];

const CONFLICT_PATTERNS = [
  "duplicate key",
  "unique constraint",
  "already exists",
  "23505",
  "conflict",
];

const RATE_LIMIT_PATTERNS = ["rate limit", "too many requests", "429", "slow down"];

const QUOTA_PATTERNS = ["insufficient credits", "not enough credits", "quota", "credit balance"];

const INTERNAL_MARKERS = [
  "pgrst",
  "postgrest",
  "supabase",
  'relation "',
  'column "',
  "violates",
  "syntax error",
  "pg_",
  "httperror",
  "typeerror",
  "referenceerror",
  "unhandled",
  "stack",
  "at object.",
  "at async",
  "zoderror",
  "failed to execute",
];

function asString(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === "object") {
    const maybe = (error as { message?: unknown }).message;
    if (typeof maybe === "string") return maybe;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

function technicalDetail(error: unknown): string {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 8_000);
  return asString(error).slice(0, 8_000);
}

/** Small stable hash so the same failure always shows the same reference. */
export function errorReference(error: unknown): string {
  const input = `${asString(error)}|${error instanceof Error ? error.name : ""}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ERR-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6)}`;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function looksInternal(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.startsWith("error:") || lower.startsWith("typeerror:") || lower.startsWith("error ")) {
    return true;
  }
  if (message.includes("\n")) return true;
  return includesAny(lower, INTERNAL_MARKERS);
}

export function describeUserError(error: unknown, fallback: string = GENERIC): UserFacingError {
  const raw = asString(error);
  const lower = raw.toLowerCase();
  const reference = errorReference(error);
  const technical = technicalDetail(error);

  if (includesAny(lower, NETWORK_PATTERNS)) {
    return {
      message: "We couldn't reach the server. Check your connection and try again.",
      reference,
      technical,
    };
  }
  if (includesAny(lower, TIMEOUT_PATTERNS)) {
    return { message: "That took too long. Please try again.", reference, technical };
  }
  if (includesAny(lower, RATE_LIMIT_PATTERNS)) {
    return {
      message: "You're going a bit fast. Wait a moment and try again.",
      reference,
      technical,
    };
  }
  if (includesAny(lower, QUOTA_PATTERNS)) {
    return {
      message: "You've run out of credits for this. Top up in Billing to keep going.",
      reference,
      technical,
    };
  }
  if (includesAny(lower, AUTH_PATTERNS)) {
    return {
      message: "Your session has expired. Please sign in again.",
      reference,
      technical,
    };
  }
  if (includesAny(lower, FORBIDDEN_PATTERNS)) {
    return { message: "You don't have permission to do that.", reference, technical };
  }
  if (includesAny(lower, CONFLICT_PATTERNS)) {
    return { message: "That already exists.", reference, technical };
  }
  if (looksInternal(raw)) {
    return { message: fallback, reference, technical };
  }
  // The app's own messages are already written for people.
  return { message: raw.trim() || fallback, reference, technical };
}

/** Convenience for the common `toast.error(...)` case. */
export function toUserMessage(error: unknown, fallback?: string): string {
  return describeUserError(error, fallback).message;
}
