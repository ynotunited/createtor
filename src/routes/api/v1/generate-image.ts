import { createFileRoute } from "@tanstack/react-router";

import { handleGenerateImage } from "@/lib/api/generate-image.server";
import { withApiVersion } from "@/lib/api-versioning.server";

export const Route = createFileRoute("/api/v1/generate-image")({
  server: {
    handlers: {
      POST: withApiVersion(handleGenerateImage),
    },
  },
});
