import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/** Tables that carry a `workspace_id` column and can be cross-referenced. */
export type WorkspaceScopedTable = "projects" | "characters" | "scripts" | "voices" | "channels";

/**
 * Verifies a row belongs to the workspace the caller claims to be acting in
 * before it is referenced by another write.
 *
 * The client passed here is the user-scoped Supabase client, so RLS also limits
 * the read to workspaces the caller belongs to. Checking `workspace_id`
 * explicitly is defence in depth: it stops a caller who belongs to workspace A
 * from passing an id that lives in workspace B and having child rows written
 * under A while pointing at B's row.
 *
 * Throws a non-enumerating error when the row is missing or out of scope.
 */
export async function assertRowInWorkspace(
  supabase: SupabaseClient<Database>,
  table: WorkspaceScopedTable,
  id: string,
  workspaceId: string,
  label: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${label} not found in this workspace.`);
}

/**
 * Verifies the caller is the owner of, or a member of, the workspace before a
 * workspace-scoped action runs.
 *
 * The read goes through the user-scoped client, so RLS already limits results;
 * this turns an invisible no-op into an explicit denial and keeps the ownership
 * check visible at the call site. Credit-spending and storage-writing server
 * functions use this so they never rely on RLS alone.
 */
export async function assertWorkspaceMember(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const denied = () => new Error("You do not have access to this workspace.");

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (workspace?.owner_id === userId) return;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw denied();
}

/** @see assertRowInWorkspace */
export async function assertProjectInWorkspace(
  supabase: SupabaseClient<Database>,
  projectId: string,
  workspaceId: string,
): Promise<void> {
  await assertRowInWorkspace(supabase, "projects", projectId, workspaceId, "Project");
}

/**
 * Verifies every requested scene exists **and** is reachable by the caller
 * before a mutation runs.
 *
 * The read goes through the user-scoped client, so RLS already limits results
 * to workspaces the caller belongs to; this turns an invisible no-op into an
 * explicit denial before the write, and keeps ownership checks visible at the
 * call site instead of being an implicit property of the database.
 */
export async function assertScenesAccessible(
  supabase: SupabaseClient<Database>,
  sceneIds: string[],
): Promise<void> {
  if (sceneIds.length === 0) throw new Error("No scenes specified.");

  const { data, error } = await supabase.from("scenes").select("id").in("id", sceneIds);
  if (error) throw new Error(error.message);

  const accessible = new Set((data ?? []).map((row) => row.id));
  if (sceneIds.some((id) => !accessible.has(id))) {
    throw new Error("Scene not found.");
  }
}
