import { createFileRoute } from "@tanstack/react-router";

import { jsonApiError, resolveApiVersion } from "@/lib/api-versioning.server";

/**
 * Catch-all for API paths that match no route. Without it the router renders
 * the HTML 404 page, which is useless to a machine client. Static routes
 * (`/api/health`, `/api/payments/*`, `/api/v1/*`) rank above the splat, so
 * nothing that exists is shadowed.
 */
async function handleApiMiss({ request }: { request: Request }): Promise<Response> {
  const { pathname } = new URL(request.url);
  const resolution = resolveApiVersion({ pathname, headers: request.headers });
  if (!resolution.ok) {
    return jsonApiError(resolution.status, resolution.message, resolution.successorPath);
  }
  return jsonApiError(404, `No API route matches ${pathname}.`);
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: handleApiMiss,
      POST: handleApiMiss,
      PUT: handleApiMiss,
      PATCH: handleApiMiss,
      DELETE: handleApiMiss,
    },
  },
});
