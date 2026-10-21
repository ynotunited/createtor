import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { enforceAdminRateLimit } from "@/lib/rate-limit.server";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims?: Record<string, unknown>;
};

function adminEmails(): string[] {
  return (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function emailIsAllowlisted(ctx: AuthContext): boolean {
  const email = typeof ctx.claims?.["email"] === "string" ? ctx.claims["email"].toLowerCase() : "";
  return Boolean(email) && adminEmails().includes(email);
}

async function userRoles(ctx: AuthContext): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((row) => row.role);
}

/**
 * True only when the caller has enrolled a verified MFA factor but the current
 * session has not stepped up to `aal2` yet. Admins who never enrolled MFA are
 * unaffected, and a transient identity-service error fails open (we only block
 * when we positively know a factor exists).
 */
async function mfaStepUpPending(ctx: AuthContext): Promise<boolean> {
  if (ctx.claims?.["aal"] === "aal2") return false;
  const token = getRequest()
    ?.headers.get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const { data, error } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (error || !data) return false;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch (error) {
    console.error("[mfa] assurance-level check failed:", error);
    return false;
  }
}

/**
 * Whether the given user is a platform admin. Admins are granted either by an
 * ADMIN_EMAILS allowlist or by a `user_roles` row with role 'admin' or
 * 'super_admin'.
 */
export async function userIsAdmin(ctx: AuthContext): Promise<boolean> {
  if (emailIsAllowlisted(ctx)) return true;
  const roles = await userRoles(ctx);
  return roles.includes("admin") || roles.includes("super_admin");
}

/**
 * Whether the given user is a super admin. Only super admins may create or
 * remove the admin role. The ADMIN_EMAILS allowlist counts as super admin so
 * an operator can always bootstrap.
 */
export async function userIsSuperAdmin(ctx: AuthContext): Promise<boolean> {
  if (emailIsAllowlisted(ctx)) return true;
  const roles = await userRoles(ctx);
  return roles.includes("super_admin");
}

/**
 * Guard for admin-only server functions. Compose after `requireSupabaseAuth`:
 *   .middleware([requireSupabaseAuth, requireAdmin])
 */
export const requireAdmin = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const ctx = context as unknown as AuthContext;
    const isAdmin = await userIsAdmin(ctx);
    if (!isAdmin) throw new Error("Forbidden: administrator access is required.");
    // Fail-closed per-admin action limit: a compromised admin session cannot
    // hammer the console, and a limiter outage denies rather than allows.
    await enforceAdminRateLimit("adminAction", ctx.userId);
    if (await mfaStepUpPending(ctx)) {
      throw new Error(
        "Multi-factor authentication required. Verify your authenticator to continue.",
      );
    }
    return next({ context: { isAdmin: true } });
  },
);

/**
 * Guard for super-admin-only server functions (e.g. granting the admin role).
 * Compose after `requireSupabaseAuth`:
 *   .middleware([requireSupabaseAuth, requireSuperAdmin])
 */
export const requireSuperAdmin = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const ctx = context as unknown as AuthContext;
    const isSuperAdmin = await userIsSuperAdmin(ctx);
    if (!isSuperAdmin) throw new Error("Forbidden: super administrator access is required.");
    if (await mfaStepUpPending(ctx)) {
      throw new Error(
        "Multi-factor authentication required. Verify your authenticator to continue.",
      );
    }
    return next({ context: { isSuperAdmin: true } });
  },
);
