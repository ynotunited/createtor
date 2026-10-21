/**
 * Environment flags shared by the browser and SSR bundles.
 *
 * `MODE` is baked in at build time: `development` under `vite dev`, `production`
 * for a release build. `VITE_APP_ENV` can override it for staging/preview
 * deployments without changing how the bundle is built.
 */

const MODE: string =
  (import.meta.env["VITE_APP_ENV"] as string | undefined) ??
  (import.meta.env["MODE"] as string | undefined) ??
  "production";

export const APP_ENV = MODE;
export const IS_PRODUCTION = MODE === "production";
export const IS_DEVELOPMENT = MODE === "development";
