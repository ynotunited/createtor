import { createFileRoute } from "@tanstack/react-router";

import { recordSecurityEvent } from "@/lib/security-events.server";

/**
 * Receives Content-Security-Policy violation reports (report-uri). While the CSP
 * is in report-only mode this is how we learn about any resource the strict
 * policy would block, before switching to enforcement.
 *
 * Reports are untrusted, unauthenticated input, so the payload is bounded and
 * only a summary is stored. The endpoint is cheap and always answers 204 so
 * browsers are not told to retry.
 */

const MAX_FIELD = 300;

function clip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD ? `${trimmed.slice(0, MAX_FIELD)}…` : trimmed;
}

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          // Guard against oversized report bodies.
          if (raw.length > 16_384) return new Response(null, { status: 204 });

          const parsed = JSON.parse(raw) as {
            "csp-report"?: Record<string, unknown>;
          } & Record<string, unknown>;
          const report =
            (parsed["csp-report"] as Record<string, unknown> | undefined) ?? parsed ?? {};

          await recordSecurityEvent("csp_violation", {
            directive: clip(report["violated-directive"] ?? report["effective-directive"]),
            blockedUri: clip(report["blocked-uri"]),
            documentUri: clip(report["document-uri"]),
            sourceFile: clip(report["source-file"]),
          });
        } catch {
          // Malformed or empty report: acknowledge and drop.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
