/**
 * Server-side environment separation.
 *
 * Development, preview and production must never share a database, or a stray
 * query during development corrupts real customer data. The deploy platform
 * injects the *current* target as `SUPABASE_URL` / `SUPABASE_PROJECT_ID`; the
 * production target is declared once as `PRODUCTION_SUPABASE_PROJECT_ID` (or
 * `PRODUCTION_SUPABASE_URL`). When a non-production build points at that
 * project, the guard fails loudly instead of quietly writing to production.
 *
 * The guard is inert until the production ref is configured, so it can ship
 * before the second Supabase project exists.
 */

export type Env = Record<string, string | undefined>;

export function serverEnvName(env: Env = process.env): string {
  return env["APP_ENV"]?.trim() || env["NODE_ENV"]?.trim() || "production";
}

export function isServerProduction(env: Env = process.env): boolean {
  return serverEnvName(env) === "production";
}

/** Extracts a Supabase project ref from a project URL, e.g. `abcd.supabase.co`. */
export function projectRefFromUrl(url: string): string | null {
  const match = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)\b/i.exec(url.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function currentTargetRef(env: Env): string | null {
  const explicit = env["SUPABASE_PROJECT_ID"]?.trim();
  if (explicit) return explicit.toLowerCase();
  return projectRefFromUrl(env["SUPABASE_URL"] ?? "");
}

function productionTargetRef(env: Env): string | null {
  const explicit = env["PRODUCTION_SUPABASE_PROJECT_ID"]?.trim();
  if (explicit) return explicit.toLowerCase();
  return projectRefFromUrl(env["PRODUCTION_SUPABASE_URL"] ?? "");
}

export type SeparationCheck = { ok: true } | { ok: false; message: string };

export function checkDatabaseSeparation(env: Env = process.env): SeparationCheck {
  if (isServerProduction(env)) return { ok: true };

  const productionRef = productionTargetRef(env);
  // Separation not configured yet: nothing to compare against.
  if (!productionRef) return { ok: true };

  const override = (env["ALLOW_PRODUCTION_DATA"] ?? "").toLowerCase();
  if (override === "1" || override === "true" || override === "yes") return { ok: true };

  const currentRef = currentTargetRef(env);
  if (currentRef && currentRef === productionRef) {
    return {
      ok: false,
      message:
        `Refusing to run "${serverEnvName(env)}" against the production Supabase project (${productionRef}). ` +
        "Point SUPABASE_URL/SUPABASE_PROJECT_ID at a separate development project, " +
        "or set ALLOW_PRODUCTION_DATA=1 to override this deliberately.",
    };
  }
  return { ok: true };
}

/** Throws when a non-production build is wired to the production database. */
export function assertSafeDatabaseTarget(env: Env = process.env): void {
  const result = checkDatabaseSeparation(env);
  if (!result.ok) throw new Error(result.message);
}

/** One-line startup banner (no secret values, refs only). */
export function environmentBanner(env: Env = process.env): string {
  const environment = serverEnvName(env);
  const current = currentTargetRef(env) ?? "unset";
  const production = productionTargetRef(env) ?? "unset";
  return `[env] environment=${environment} supabase=${current} production=${production}`;
}
