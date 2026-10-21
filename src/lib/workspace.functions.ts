import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { FREE_PLAN_MONTHLY_CREDITS } from "@/lib/pricing";
import { defaultWorkspaceName, isMissingFunctionError } from "@/lib/workspace-helpers";

/** Lazily load the service-role client so route bundles never import it eagerly. */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AdminClient = Awaited<ReturnType<typeof admin>>;

export type Workspace = {
  id: string;
  name: string;
  plan: Database["public"]["Enums"]["plan_tier"];
  owner_id: string;
};

const WORKSPACE_COLUMNS = "id,name,plan,owner_id";

/**
 * Returns the signed-in user's workspace, creating it with its free monthly
 * credit allotment on first call.
 *
 * The atomic path is the `ensure_workspace` RPC (migration 0014): it serializes
 * per user and creates workspace + owner membership + credit balance + grant in
 * a single transaction, so a partial failure can never lock the owner out or
 * duplicate the welcome credits. Until that migration is applied the function
 * falls back to a best-effort client-side bootstrap.
 */
export const getOrCreateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Workspace> => {
    const ctx = context as unknown as { userId: string; claims?: { email?: string } };
    const client = await admin();
    const name = defaultWorkspaceName(ctx.claims?.email);

    const { data, error } = await client.rpc("ensure_workspace", {
      _user_id: ctx.userId,
      _default_name: name,
      _free_credits: FREE_PLAN_MONTHLY_CREDITS,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) return row as Workspace;
      throw new Error("Workspace bootstrap returned no row.");
    }

    if (!isMissingFunctionError(error)) throw new Error(error.message);

    console.warn("[workspace] ensure_workspace RPC unavailable; using fallback bootstrap");
    return fallbackBootstrap(client, ctx.userId, name);
  });

/**
 * Non-atomic bootstrap used only when migration 0014 is not applied. Repairs an
 * existing workspace's membership/credits if they are missing, and grants the
 * free credits exactly once (only when the usage_credits row is created).
 */
async function fallbackBootstrap(
  client: AdminClient,
  userId: string,
  name: string,
): Promise<Workspace> {
  const { data: existing, error: readError } = await client
    .from("workspaces")
    .select(WORKSPACE_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (readError) throw new Error(readError.message);

  let workspace = existing?.[0] as Workspace | undefined;

  if (!workspace) {
    const { data: created, error: createError } = await client
      .from("workspaces")
      .insert({ owner_id: userId, name })
      .select(WORKSPACE_COLUMNS)
      .single();

    if (createError) {
      // A concurrent request may have created it first; return that one.
      const { data: raced } = await client
        .from("workspaces")
        .select(WORKSPACE_COLUMNS)
        .eq("owner_id", userId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (raced?.[0]) workspace = raced[0] as Workspace;
      else throw new Error(createError.message);
    } else {
      workspace = created as Workspace;
    }
  }

  // Owner membership is required for credits, payments and RLS reads.
  const { error: memberError } = await client
    .from("workspace_members")
    .upsert(
      { workspace_id: workspace.id, user_id: userId, role: "owner" },
      { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
    );
  if (memberError) throw new Error(memberError.message);

  const { data: creditRow, error: creditError } = await client
    .from("usage_credits")
    .upsert(
      { workspace_id: workspace.id, balance: FREE_PLAN_MONTHLY_CREDITS, lifetime_purchased: 0 },
      { onConflict: "workspace_id", ignoreDuplicates: true },
    )
    .select("id");
  if (creditError) throw new Error(creditError.message);

  // A non-empty result means the row was inserted now — grant the ledger entry once.
  if (creditRow && creditRow.length > 0) {
    const { error: ledgerError } = await client.from("credit_transactions").insert({
      workspace_id: workspace.id,
      kind: "grant",
      amount: FREE_PLAN_MONTHLY_CREDITS,
      reason: "Free monthly credits",
    });
    if (ledgerError) {
      console.error(`[workspace] could not record initial credit grant: ${ledgerError.message}`);
    }
  }

  return workspace;
}
