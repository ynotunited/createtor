import { createContext, useCallback, useContext } from "react";

/**
 * Provides the public admin base path to child routes so they can build links to
 * the secret console path without each calling `adminMe`. Defaults to the plain
 * `/admin` so links stay valid when no custom path is configured.
 */
export const AdminPathContext = createContext<string>("admin");

/** Builds the public href for an admin page slug (e.g. "audit", "users/123"). */
export function adminHref(adminPath: string, slug: string): string {
  const base = `/${adminPath}`;
  return slug ? `${base}/${slug}` : base;
}

export function useAdminHref(): (slug: string) => string {
  const adminPath = useContext(AdminPathContext);
  return useCallback((slug: string) => adminHref(adminPath, slug), [adminPath]);
}
