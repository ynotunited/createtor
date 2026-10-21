// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import type { Plugin } from "vite";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The installed TanStack Start client runtime (`@tanstack/start-client-core`) reads
// `process.env.TSS_SERVER_FN_BASE` at module scope in `createClientRpc`. The
// production build replaces it with a literal via Rollup, but the dev server
// serves that module straight from node_modules where `process` is undefined in
// the browser, crashing every server-fn import with:
//   TypeError: Cannot read properties of undefined (reading 'TSS_SERVER_FN_BASE')
// This plugin substitutes the token in dev so behaviour matches the built output.
// The value must match what the production build bakes in.
const SERVER_FN_BASE = "/_serverFn/";

function tanstackStartClientEnvFix(): Plugin {
  return {
    name: "tanstack-start-client-env-fix",
    enforce: "pre",
    apply: "serve",
    transform(code, id) {
      if (!id.includes("start-client-core") && !id.includes("react-start")) return null;
      if (!code.includes("process.env.TSS_SERVER_FN_BASE")) return null;
      return {
        code: code.replaceAll("process.env.TSS_SERVER_FN_BASE", JSON.stringify(SERVER_FN_BASE)),
        map: null,
      };
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [tanstackStartClientEnvFix()],
  },
});
