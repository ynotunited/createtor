import { createFileRoute } from "@tanstack/react-router";

import { handleGenerateImage } from "@/lib/api/generate-image.server";
import { withApiVersion } from "@/lib/api-versioning.server";

/**
 * Deprecated unversioned endpoint. Kept working for existing clients, served
 * with `Deprecation` / `Sunset` headers pointing at `/api/v1/generate-image`.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: withApiVersion(handleGenerateImage),
    },
  },
});
