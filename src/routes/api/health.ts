import { createFileRoute } from "@tanstack/react-router";

import { withApiVersion } from "@/lib/api-versioning.server";

const APP_VERSION = process.env["npm_package_version"] ?? "0.0.0";

/**
 * Deprecated unversioned endpoint; see `/api/v1/health` for the current one.
 * The lifecycle (Deprecation/Sunset) travels in headers via `withApiVersion`.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: withApiVersion(async () => {
        return Response.json(
          {
            status: "ok",
            service: "createtor",
            version: APP_VERSION,
            apiVersion: "v0",
            latestApiVersion: "v1",
            successor: "/api/v1/health",
            time: new Date().toISOString(),
          },
          { status: 200 },
        );
      }),
    },
  },
});
