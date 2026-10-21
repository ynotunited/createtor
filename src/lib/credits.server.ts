/**
 * Credit helpers shared by the generation paths.
 *
 * `ensureMonthlyFreeCredits` implements the free plan's "1,000 credits every
 * month" promise: before any balance check, it asks Postgres to top a free
 * workspace back up to the monthly floor (at most once per calendar month, no
 * rollover). It is idempotent and cheap for paid workspaces and same-period
 * calls. Failures are logged but never block generation — a credits outage must
 * not stop AI/voice/video work, and the balance check downstream still applies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { FREE_PLAN_MONTHLY_CREDITS } from "@/lib/pricing";

/** PostgREST/Postgres codes returned when the RPC is not in the schema yet. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

export async function ensureMonthlyFreeCredits(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("claim_free_monthly_credits", {
      _workspace_id: workspaceId,
      _credits: FREE_PLAN_MONTHLY_CREDITS,
    });
    if (!error) return;
    // Migration 0015 not applied yet: expected, stay silent.
    if (MISSING_FUNCTION_CODES.has(error.code ?? "")) return;
    console.error(`[credits] monthly free-credit claim failed: ${error.message}`);
  } catch (error) {
    console.error(
      `[credits] monthly free-credit claim threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
