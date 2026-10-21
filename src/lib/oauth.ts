/**
 * OAuth sign-in policy.
 *
 * Kept in one place so the security-critical parts — the exact return URL and
 * the requested scopes — are explicit and testable rather than buried in a
 * component.
 */

/** The minimum Google scopes a sign-in needs. Nothing broader is ever requested. */
export const OAUTH_SCOPES = ["openid", "email", "profile"] as const;

/** Scopes as the space-separated string Supabase expects. */
export const OAUTH_SCOPE_STRING = OAUTH_SCOPES.join(" ");

/**
 * Resolves the OAuth return URL.
 *
 * Prefers an explicitly configured URL so the callback target is fixed and can
 * be locked to Google's authorized-redirect allowlist. Falls back to the current
 * origin's `/auth` only for local development (when nothing is configured).
 */
export function resolveOAuthRedirect(opts: {
  configuredUrl?: string | undefined;
  origin: string;
}): string {
  const configured = opts.configuredUrl?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${opts.origin.replace(/\/+$/, "")}/auth`;
}

/** The full options passed to `supabase.auth.signInWithOAuth`. */
export function googleOAuthOptions(opts: { configuredUrl?: string | undefined; origin: string }): {
  redirectTo: string;
  scopes: string;
  queryParams: { prompt: string };
} {
  return {
    redirectTo: resolveOAuthRedirect(opts),
    scopes: OAUTH_SCOPE_STRING,
    queryParams: { prompt: "select_account" },
  };
}
