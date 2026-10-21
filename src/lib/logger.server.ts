/**
 * Minimal structured logger for the Worker runtime.
 *
 * Emits one JSON object per line so Cloudflare Workers Logpush / `wrangler tail`
 * / any log drain can parse fields without regex. Never pass raw headers,
 * cookies, tokens, query strings or request bodies to these helpers: only
 * non-sensitive routing + outcome metadata belongs in logs.
 */

type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "log.serialize" });
  }
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = safeStringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Marks an event that matters for abuse/suspicious-activity detection. */
export function logSecurity(event: string, fields: LogFields = {}): void {
  log("warn", `security.${event}`, fields);
}

/**
 * Best-effort client IP. Cloudflare sets `cf-connecting-ip`; fall back to the
 * first `x-forwarded-for` hop for local/other proxies.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0];
  return first ? first.trim() : null;
}

/** Short, bounded user-agent (full UA can be large and noisy). */
export function userAgentFromHeaders(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 200) : null;
}
