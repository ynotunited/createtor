import { createFileRoute } from "@tanstack/react-router";

import { withApiVersion } from "@/lib/api-versioning.server";

const APP_VERSION = process.env["npm_package_version"] ?? "0.0.0";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: withApiVersion(async () => {
        return Response.json(
          {
            status: "ok",
            service: "createtor",
            version: APP_VERSION,
            apiVersion: "v1",
            time: new Date().toISOString(),
          },
          { status: 200 },
        );
      }),
    },
  },
});
