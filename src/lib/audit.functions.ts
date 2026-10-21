/**
 * Authenticated audit sink for sensitive actions taken directly from the
 * browser (e.g. deleting a row through RLS-protected tables). The action string
 * is validated and workspace membership is re-checked server-side, so a client
 * cannot forge an audit entry for a workspace it does not belong to.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const auditInput = z.object({
  action: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_.]+$/, "Action must be lower_snake.case"),
  entity: z.string().min(1).max(64).optional(),
  entityId: z.string().max(128).optional(),
  workspaceId: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export const recordAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => auditInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      userId: string;
      supabase: {
        from: (table: string) => unknown;
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
      };
    };

    const { data: isMember } = await ctx.supabase.rpc("is_workspace_member", {
      _workspace_id: data.workspaceId,
    });
    if (isMember !== true) {
      throw new Error("You do not have access to this workspace.");
    }

    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const [{ getRequest }, { clientIpFromHeaders, userAgentFromHeaders }] = await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/lib/logger.server"),
      ]);
      const request = getRequest() as Request | undefined;
      if (request) {
        ip = clientIpFromHeaders(request.headers);
        userAgent = userAgentFromHeaders(request.headers);
      }
    } catch {
      // Request context is unavailable in some runtimes; the entry is still useful.
    }

    const { auditEvent } = await import("@/lib/audit.server");
    await auditEvent({
      actorId: ctx.userId,
      action: data.action,
      entity: data.entity ?? null,
      entityId: data.entityId ?? null,
      workspaceId: data.workspaceId,
      ...(data.metadata ? { metadata: data.metadata } : {}),
      ip,
      userAgent,
    });

    return { ok: true };
  });
