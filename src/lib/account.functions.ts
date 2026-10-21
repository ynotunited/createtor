/**
 * Account data rights: self-service erasure.
 *
 * Implements the privacy-policy promise that a user can delete their account and
 * have personal data removed. The database work is done atomically by the
 * `erase_user_data` RPC (migration 0026); this layer adds the auth-user deletion
 * and an audit record, both of which only the service role can perform.
 *
 * Order matters: erase the database rows first, then delete the auth user. If
 * the auth deletion fails we still return success — the personal data is already
 * gone and the auth record is unusable (its profile is de-identified).
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function requireServiceKey(): void {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    throw new Error(
      "Account deletion needs the SUPABASE_SERVICE_ROLE_KEY environment variable. Add your Supabase service role key and try again.",
    );
  }
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Erase the personal data (workspaces, content, telemetry, profile).
    const { data: summary, error } = await supabaseAdmin.rpc("erase_user_data", {
      _user_id: ctx.userId,
    });
    if (error) throw new Error(error.message);

    // 2. Delete the auth user so the identity can no longer sign in.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(ctx.userId);
    if (authError) {
      console.error(`[account] auth user delete failed after erasure: ${authError.message}`);
    }

    // 3. Record that an account was erased. The actor no longer exists, so the
    //    row is attributed to the (now de-identified) id and carries no PII.
    const { auditEvent } = await import("@/lib/audit.server");
    await auditEvent({
      actorId: null,
      action: "account.erase",
      entity: "profiles",
      entityId: ctx.userId,
      metadata: { summary: summary ?? {}, selfService: true },
    });

    return { ok: true };
  });
