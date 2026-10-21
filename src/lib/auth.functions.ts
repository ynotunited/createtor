/**
 * Client-callable auth abuse gate.
 *
 * The browser talks to Supabase Auth directly, so the app cannot wrap every
 * request. Instead the auth form calls `authorizeAuthAttempt` before each
 * Supabase call and `reportAuthOutcome` after, so identity/IP limits, lockouts
 * and failure telemetry apply to the UI flow. Supabase's own server-side auth
 * rate limits remain the backstop for callers that bypass the UI.
 *
 * Both handlers fail open: a limiter or telemetry outage must never block a
 * legitimate sign-in.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const kindSchema = z.enum(["signin", "signup", "reset", "otp"]);

const gateInput = z.object({
  kind: kindSchema,
  email: z.string().email().max(320).optional(),
});

export const authorizeAuthAttempt = createServerFn({ method: "POST" })
  .validator((input: unknown) => gateInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { guardAuthAttempt } = await import("@/lib/behavior.server");
    return guardAuthAttempt({ kind: data.kind, email: data.email ?? null });
  });

const outcomeInput = z.object({
  kind: kindSchema,
  email: z.string().email().max(320).optional(),
  success: z.boolean(),
});

export const reportAuthOutcome = createServerFn({ method: "POST" })
  .validator((input: unknown) => outcomeInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { recordAuthOutcome } = await import("@/lib/behavior.server");
    await recordAuthOutcome({ kind: data.kind, email: data.email ?? null, success: data.success });
    return { ok: true };
  });
