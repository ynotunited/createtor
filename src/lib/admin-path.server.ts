/**
 * Secret admin path gating.
 *
 * The admin console ships under the route id `/admin` in the file-based router,
 * but the public URL can be hidden behind an unguessable first segment declared
 * by `ADMIN_PATH`. Requests to the real path are rewritten to `/admin/*` before
 * the router sees them, and the literal `/admin` is answered with a plain 404 so
 * a probe cannot even confirm the console exists.
 *
 * When `ADMIN_PATH` is unset (or `admin`) the behaviour is unchanged: the
 * console lives at `/admin` as before.
 */

const ADMIN_PATH_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const RESERVED_SEGMENTS = new Set([
  "api",
  "assets",
  "auth",
  "login",
  "logout",
  "signup",
  "www",
  "public",
  "static",
  "admin", // handled separately so the decoy 404 logic stays explicit
]);

/** The normalised, effective admin path. Empty string means "not configured". */
export function resolveAdminPath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env["ADMIN_PATH"] ?? "").trim().toLowerCase();
  if (!raw) return "";
  // Reject anything that is not a single safe path segment. A bad value must
  // never widen access, so the safe fallback is "not configured".
  if (!ADMIN_PATH_PATTERN.test(raw)) return "";
  if (RESERVED_SEGMENTS.has(raw)) return "";
  return raw;
}

export type AdminPathDecision =
  { kind: "pass" } | { kind: "rewrite"; pathname: string } | { kind: "not_found" };

/**
 * Classifies a request path against the configured admin path.
 *
 *  - The secret path (`/<ADMIN_PATH>/...`) is rewritten to `/admin/...` so the
 *    router matches the real route tree.
 *  - The literal `/admin` (and its subtree) is a decoy and returns not_found
 *    whenever a custom secret path is configured.
 *  - Everything else passes through untouched.
 */
export function classifyAdminPath(pathname: string, adminPath: string): AdminPathDecision {
  if (!adminPath || adminPath === "admin") return { kind: "pass" };

  const segments = pathname.split("/");
  const first = (segments[1] ?? "").toLowerCase();

  if (first === "admin") return { kind: "not_found" };

  if (first === adminPath) {
    const rest = segments.slice(2).join("/");
    const rewritten = rest ? `/admin/${rest}` : "/admin";
    return { kind: "rewrite", pathname: rewritten };
  }

  return { kind: "pass" };
}
