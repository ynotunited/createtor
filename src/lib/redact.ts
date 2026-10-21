/**
 * PII redaction primitives.
 *
 * Two jobs:
 *   1. Pseudonymise network identifiers. Raw IPs are a direct personal datum;
 *      we store only a salted SHA-256 prefix so the same address still maps to
 *      the same pseudonym (abuse correlation works) but the raw value never
 *      lands in the database, Redis or a log line.
 *   2. Scrub free text before it is persisted. Error messages, stacks, and
 *      arbitrary jsonb metadata routinely embed an email address or a card-like
 *      digit run; `redactText` / `redactValue` remove them.
 *
 * Everything here is pure (no I/O) except `hashIp`, which uses Web Crypto and is
 * therefore async. Kept import-free so it can be unit tested in isolation.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/** 13-19 digits, optionally space/dash separated: card-like, too long for a phone. */
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
/** 7-12 digit runs: phone-like. Kept conservative to avoid mangling ids/years. */
const PHONE_RE = /\b\d{7,12}\b/g;

const IP_KEY_RE = /(^|[._-])(ip|ipaddr|ipaddress|remoteaddr|addr|clientip)($|[._-])/i;

const MAX_HASH_SALT_FALLBACK = "createtor-ip";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Stable pseudonym for an IP. Returns `null` for empty input so callers can keep
 * the column nullable. The result is prefixed `ip_` and is a hash, never the IP.
 *
 * `salt` should come from an env secret; when unset a fixed fallback is used so
 * the app still never stores the raw address (the pseudonym is then global, not
 * per-deployment, which is weaker but still removes the direct identifier).
 */
export async function hashIp(
  ip: string | null | undefined,
  salt: string | null | undefined,
): Promise<string | null> {
  const trimmed = typeof ip === "string" ? ip.trim() : "";
  if (!trimmed) return null;
  const effectiveSalt = salt && salt.length > 0 ? salt : MAX_HASH_SALT_FALLBACK;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${effectiveSalt}:${trimmed}`),
  );
  return `ip_${toHex(new Uint8Array(digest)).slice(0, 16)}`;
}

/** True when a metadata key looks like it holds a network identifier. */
export function isNetworkKey(key: string): boolean {
  return IP_KEY_RE.test(key);
}

/** Removes emails, card-like and phone-like digit runs from a string. */
export function redactText(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(CARD_RE, "[redacted]")
    .replace(PHONE_RE, "[redacted]");
}

const MAX_DEPTH = 6;

/**
 * Deep-redacts a JSON-ish value: strings run through `redactText`, network-ish
 * keys have any string value replaced wholesale, and nesting is bounded so a
 * pathological structure cannot recurse forever. Non-plain objects are dropped.
 */
export function redactValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    if (isNetworkKey(key)) return "[ip]";
    return redactText(value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(v, k, depth + 1);
    }
    return out;
  }
  return undefined;
}

/** Deep-redacts a metadata object, returning a plain object safe to persist. */
export function redactMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const redacted = redactValue(metadata ?? {});
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {};
}
