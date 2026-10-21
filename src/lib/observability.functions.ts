/**
 * Client-callable observability endpoints.
 *
 * `reportClientError` funnels browser errors into the same `error_issues` table
 * as server errors; `track` records product analytics events. Both are
 * unauthenticated (pre-login errors matter too) and therefore strictly bounded:
 * short strings only, no headers/tokens, and the per-IP server-function limiter
 * caps call volume. Handlers fail open.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const errorInput = z.object({
  message: z.string().min(1).max(1_000),
  stack: z.string().max(8_000).optional(),
  path: z.string().max(512).optional(),
  level: z.enum(["error", "warning", "info"]).default("error"),
});

export const reportClientError = createServerFn({ method: "POST" })
  .validator((input: unknown) => errorInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { captureIssue } = await import("@/lib/issues.server");
    const error = new Error(data.message);
    if (data.stack) error.stack = data.stack;
    await captureIssue(error, { kind: "client", level: data.level, path: data.path ?? null });
    return { ok: true };
  });

const trackInput = z.object({
  event: z.string().min(1).max(64),
  path: z.string().max(512).optional(),
  workspaceId: z.string().uuid().optional(),
  props: z.record(z.unknown()).optional(),
});

export const track = createServerFn({ method: "POST" })
  .validator((input: unknown) => trackInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { trackEvent } = await import("@/lib/analytics.server");

    // Analytics are anonymous, so a workspace id is only ever attributed when
    // the caller proves membership in it. Otherwise the event is recorded
    // without the id rather than trusting an arbitrary UUID from the browser.
    let workspaceId: string | null = null;
    if (data.workspaceId) {
      const userId = await callerUserId();
      if (userId) {
        const { isWorkspaceMember } = await import("@/lib/billing.server");
        if (await isWorkspaceMember(userId, data.workspaceId)) workspaceId = data.workspaceId;
      }
    }

    const event: {
      event: string;
      path: string | null;
      workspaceId: string | null;
      props?: Record<string, unknown>;
    } = {
      event: data.event,
      path: data.path ?? null,
      workspaceId,
    };
    if (data.props) event.props = data.props;
    await trackEvent(event);
    return { ok: true };
  });

/** Best-effort caller identity for anonymous endpoints; null when unsigned-in. */
async function callerUserId(): Promise<string | null> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    if (token.split(".").length !== 3) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
