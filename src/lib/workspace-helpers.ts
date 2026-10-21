/**
 * Pure helpers for workspace bootstrap. Kept free of server/runtime imports so
 * they can be unit tested and reused without pulling the auth stack into a test.
 */

/** Derives the friendly default workspace name from the user's email. */
export function defaultWorkspaceName(email: string | null | undefined): string {
  const prefix = email?.split("@")[0]?.trim();
  return prefix ? `${prefix} workspace` : "My workspace";
}

export type RpcErrorLike = { code?: string | null; message?: string | null };

/**
 * True when an RPC failed because the function is not present in the schema
 * (migration not yet applied). Used to fall back to the legacy path instead of
 * hard-failing workspace bootstrap on an unmigrated environment.
 */
export function isMissingFunctionError(error: RpcErrorLike): boolean {
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}
