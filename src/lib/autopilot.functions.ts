/**
 * Persists the Daily Queue (autopilot) configuration.
 *
 * The plan entitlement and the numeric bounds are enforced here, on the server,
 * not in the browser. The browser shows a disabled switch and an upgrade prompt,
 * but any value it sends is re-derived and re-clamped before it reaches the
 * database: the workspace plan is read from `workspaces.plan` (never trusted
 * from the payload) and a non-entitled workspace can never save `enabled: true`.
 * A matching CHECK constraint and trigger in the database back this up so a
 * direct PostgREST write cannot bypass it either.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertWorkspaceMember } from "@/lib/ownership";
import { PLANS } from "@/lib/pricing";
import { isValidTimeZone } from "@/lib/schedule";

const PLATFORMS = [
  "youtube",
  "youtube_shorts",
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "threads",
] as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MODES = ["manual", "review", "full"] as const;

export const MIN_VIDEOS_PER_WEEK = 1;
export const MAX_VIDEOS_PER_WEEK = 35;
export const MIN_VIDEO_DURATION_SECONDS = 10;
export const MAX_VIDEO_DURATION_SECONDS = 900;

const saveInput = z.object({
  workspaceId: z.string().uuid(),
  enabled: z.boolean().default(false),
  mode: z.enum(MODES).default("review"),
  niche: z.string().max(200).default(""),
  audience: z.string().max(200).default(""),
  language: z.string().max(16).default("en"),
  visualStyle: z.string().max(100).default("cinematic"),
  videosPerWeek: z.number().int().default(3),
  videoDurationSeconds: z.number().int().default(45),
  platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length).default([]),
  postingDays: z.array(z.enum(DAYS)).max(DAYS.length).default([]),
  postingTimes: z.array(z.string().max(5)).max(24).default([]),
  timezone: z.string().min(1).max(64).default("UTC"),
});

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function isAutopilotPlan(plan: string): boolean {
  return PLANS.find((p) => p.key === plan)?.autopilot ?? false;
}

/** Pure decision used by the handler: entitlement + clamped numeric fields. */
export function resolveAutopilotFields(input: {
  plan: string;
  enabled: boolean;
  videosPerWeek: number;
  videoDurationSeconds: number;
}): { entitled: boolean; enabled: boolean; videosPerWeek: number; videoDurationSeconds: number } {
  const entitled = isAutopilotPlan(input.plan);
  return {
    entitled,
    enabled: entitled && input.enabled,
    videosPerWeek: clamp(input.videosPerWeek, MIN_VIDEOS_PER_WEEK, MAX_VIDEOS_PER_WEEK, 3),
    videoDurationSeconds: clamp(
      input.videoDurationSeconds,
      MIN_VIDEO_DURATION_SECONDS,
      MAX_VIDEO_DURATION_SECONDS,
      45,
    ),
  };
}

export const saveAutopilotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as unknown as { userId: string }).userId;

    await assertWorkspaceMember(supabase, userId, data.workspaceId);

    // The plan is the single source of entitlement; the client cannot assert it.
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("plan")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (workspaceError) throw new Error(workspaceError.message);
    if (!workspace) throw new Error("Workspace not found.");

    const resolved = resolveAutopilotFields({
      plan: workspace.plan,
      enabled: data.enabled,
      videosPerWeek: data.videosPerWeek,
      videoDurationSeconds: data.videoDurationSeconds,
    });

    const postingTimes = data.postingTimes
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));

    const payload = {
      workspace_id: data.workspaceId,
      enabled: resolved.enabled,
      mode: data.mode,
      niche: data.niche || null,
      audience: data.audience || null,
      language: data.language,
      visual_style: data.visualStyle,
      videos_per_week: resolved.videosPerWeek,
      video_duration_seconds: resolved.videoDurationSeconds,
      platforms: data.platforms,
      posting_days: data.postingDays,
      posting_times: postingTimes,
      timezone: isValidTimeZone(data.timezone) ? data.timezone : "UTC",
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: readError } = await supabase
      .from("autopilot_configs")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const write = existing
      ? supabase.from("autopilot_configs").update(payload).eq("id", existing.id)
      : supabase.from("autopilot_configs").insert(payload);
    const { error } = await write;
    if (error) throw new Error(error.message);

    return { ok: true, enabled: payload.enabled, entitled: resolved.entitled };
  });
