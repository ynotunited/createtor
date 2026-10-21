/**
 * Raw fixed-window counter primitive shared by the request limiter and the
 * security-event store. Kept separate so those two modules can depend on it
 * without importing each other (no cycle).
 *
 * Returns a tri-state rather than throwing so each caller can choose its own
 * failure policy: the request limiter fails open, the event store fails closed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  consumeRedisRateLimit,
  redisLimiterEnabled,
  deleteRedisRateLimit,
  peekRedisRateLimit,
} from "@/lib/limiter-redis.server";

export type RateLimitDecision = "allowed" | "denied" | "error";

/** PostgREST/Postgres codes returned when the RPC is not in the schema yet. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

async function adminClient(): Promise<SupabaseClient<Database>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<Database>;
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision> {
  // Prefer Redis when configured; on any Redis failure fall through to
  // Postgres so a Redis outage degrades latency rather than protection.
  if (redisLimiterEnabled()) {
    const viaRedis = await consumeRedisRateLimit(key, limit, windowSeconds);
    if (viaRedis !== "error") return viaRedis;
  }

  try {
    const client = await adminClient();
    const { data, error } = await client.rpc("check_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      // A missing function means migration 0011 is not applied: expected and
      // quiet, so pre-migration traffic does not spam the log drain.
      if (!MISSING_FUNCTION_CODES.has(error.code ?? "")) {
        console.error(`[rate-limit] check failed for ${key}: ${error.message}`);
      }
      return "error";
    }
    return data === true ? "allowed" : "denied";
  } catch (error) {
    console.error(
      `[rate-limit] check threw for ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "error";
  }
}

/**
 * Reads a counter without incrementing it, for read-only lockout checks. Returns
 * null when the value is unavailable (limiter outage) so callers can decide.
 */
export async function peekRateLimit(key: string, windowSeconds: number): Promise<number | null> {
  if (redisLimiterEnabled()) {
    const viaRedis = await peekRedisRateLimit(key);
    if (viaRedis !== null) return viaRedis;
  }
  try {
    const client = await adminClient();
    const { data, error } = await client.rpc("peek_rate_limit", {
      _key: key,
      _window_seconds: windowSeconds,
    });
    if (error) {
      if (!MISSING_FUNCTION_CODES.has(error.code ?? "")) {
        console.error(`[rate-limit] peek failed for ${key}: ${error.message}`);
      }
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (error) {
    console.error(
      `[rate-limit] peek threw for ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Deletes a counter, clearing a lockout early (e.g. after a successful login or
 * when an admin unblocks someone). Best-effort: clears Redis when enabled and
 * the Postgres row via `clear_rate_limit` (0019). Never throws.
 */
export async function clearRateLimit(key: string): Promise<void> {
  if (redisLimiterEnabled()) await deleteRedisRateLimit(key);
  try {
    const client = await adminClient();
    const { error } = await client.rpc("clear_rate_limit", { _key: key });
    if (error && !MISSING_FUNCTION_CODES.has(error.code ?? "")) {
      console.error(`[rate-limit] clear failed for ${key}: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `[rate-limit] clear threw for ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
