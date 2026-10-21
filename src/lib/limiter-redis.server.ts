/**
 * Optional Upstash Redis backend for the fixed-window limiter.
 *
 * The Postgres limiter (`check_rate_limit`) is already distributed — counters
 * are shared across every Worker isolate and region — so Redis is purely a
 * latency optimisation: a single REST round-trip instead of a Postgres RPC on
 * every request. It activates only when both `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are configured; otherwise callers fall straight
 * through to Postgres.
 *
 * Uses the Upstash REST pipeline (works on the Workers runtime with no TCP
 * client) to `INCR` the counter and set its TTL in one round-trip. Returns the
 * same tri-state as the Postgres primitive so callers keep one failure policy:
 * Redis errors are surfaced as "error" and the caller falls back to Postgres.
 */

export type RedisRateLimitDecision = "allowed" | "denied" | "error";

const FETCH_TIMEOUT_MS = 1_500;

type RedisConfig = { url: string; token: string };

function redisConfig(): RedisConfig | null {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

/** True when Redis is configured; lets callers skip the attempt entirely. */
export function redisLimiterEnabled(): boolean {
  return redisConfig() !== null;
}

/** Namespaces limiter keys so they never collide with other Redis data. */
function redisKey(key: string): string {
  return `rl:${key}`;
}

/** Best-effort removal of a counter (used to clear a lockout). Never throws. */
export async function deleteRedisRateLimit(key: string): Promise<void> {
  const config = redisConfig();
  if (!config) return;
  try {
    await fetch(`${config.url}/DEL/${encodeURIComponent(redisKey(key))}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
    });
  } catch {
    // Clearing is best-effort; the window will expire on its own.
  }
}

/**
 * Reads a counter without incrementing it, or null when unavailable. Used for
 * read-only lockout checks so a legitimate attempt never bumps a failure count.
 */
export async function peekRedisRateLimit(key: string): Promise<number | null> {
  const config = redisConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/GET/${encodeURIComponent(redisKey(key))}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: unknown };
    const count = Number(payload?.result);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

/**
 * Increments `key` in Redis and reports whether `limit` was exceeded within
 * `windowSeconds`. The TTL is set only on the first increment (`EXPIRE … NX`)
 * so the window starts at the first request and does not slide.
 */
export async function consumeRedisRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RedisRateLimitDecision> {
  const config = redisConfig();
  if (!config) return "error";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey(key)],
        ["EXPIRE", redisKey(key), String(windowSeconds), "NX"],
      ]),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[rate-limit] redis responded ${response.status} for ${key}`);
      return "error";
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: unknown }>;
    const first = Array.isArray(payload) ? payload[0] : undefined;
    if (first?.error) {
      console.error(`[rate-limit] redis error for ${key}: ${String(first.error)}`);
      return "error";
    }

    const count = Number(first?.result);
    if (!Number.isFinite(count)) return "error";
    return count <= limit ? "allowed" : "denied";
  } catch (error) {
    console.error(
      `[rate-limit] redis check threw for ${key}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}
