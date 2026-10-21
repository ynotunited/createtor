import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { CREDIT_COSTS } from "@/lib/pricing";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { assertWorkspaceMember } from "@/lib/ownership";
import { enforceRateLimit } from "@/lib/rate-limit.server";

const StartInput = z.object({
  workspaceId: z.string().uuid(),
  narration: z.string().min(1).max(1200),
  videoPrompt: z.string().min(1).max(2000),
  style: z.string().max(100),
  cameraMovement: z.string().max(200),
  lighting: z.string().max(200),
  aspectRatio: z.enum(["16:9", "9:16"]),
  durationSeconds: z.number().int().min(2).max(15).nullable().optional(),
  name: z.string().min(1).max(200),
});

/** Starts a scene clip job. Credits are checked now but only charged once the clip is saved. */
export const startSceneVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => StartInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as unknown as { userId: string }).userId;
    await enforceRateLimit("video", userId);
    await assertWorkspaceMember(supabase, userId, data.workspaceId);
    await ensureMonthlyFreeCredits(supabase, data.workspaceId);
    const credits = await supabase
      .from("usage_credits")
      .select("balance")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (credits.error) throw new Error(credits.error.message);
    if ((credits.data?.balance ?? 0) < CREDIT_COSTS.sceneVideo)
      throw new Error(`Not enough credits. A scene clip needs ${CREDIT_COSTS.sceneVideo}.`);

    const words = data.narration.trim().split(/\s+/).length;
    const durationFromNarration = Math.min(10, Math.max(4, Math.ceil(words / 2.4) + 1));
    const duration =
      data.durationSeconds == null
        ? durationFromNarration
        : Math.min(15, Math.max(2, Math.round(data.durationSeconds)));

    const prompt = [
      `${data.videoPrompt}.`,
      `Visual style: ${data.style}. Lighting: ${data.lighting}. Camera: ${data.cameraMovement}.`,
      "In a single continuous shot, no scene cuts. Consider micro-detail, expression and timing.",
      `Audio: a warm, clear narrator voice-over says: "${data.narration.replace(/"/g, "'")}". Soft ambient background music under the voice. No other dialogue.`,
      "No captions, no on-screen text, no watermarks.",
    ].join(" ");

    const { createVideoJob } = await import("@/lib/video-gateway.server");
    const job = await createVideoJob(prompt, duration, data.aspectRatio);

    const row = await supabase
      .from("video_jobs")
      .insert({
        workspace_id: data.workspaceId,
        kind: "scene_clip",
        provider: "lovable-ai-video",
        status: "generating",
        credits_reserved: CREDIT_COSTS.sceneVideo,
        payload: {
          gatewayId: job.id,
          prompt,
          narration: data.narration,
          duration,
          name: data.name,
        },
      })
      .select("id")
      .single();
    if (row.error) throw new Error(row.error.message);
    return { jobId: row.data.id };
  });

type Payload = {
  gatewayId: string;
  narration: string;
  duration: number;
  name: string;
  prompt: string;
};
type Result = { assetId: string; videoPath: string; captionsPath: string };

async function signed(supabase: SupabaseClient<Database>, r: Result) {
  const [v, c] = await Promise.all([
    supabase.storage.from("media").createSignedUrl(r.videoPath, 3600),
    supabase.storage.from("media").createSignedUrl(r.captionsPath, 3600),
  ]);
  return { videoUrl: v.data?.signedUrl ?? null, captionsUrl: c.data?.signedUrl ?? null };
}

/** Polls a job; on completion stores MP4 + captions, charges credits, and adds a Media Library entry. */
export const checkSceneVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const found = await supabase.from("video_jobs").select("*").eq("id", data.jobId).single();
    if (found.error) throw new Error("Job not found.");
    const jobRow = found.data;
    const payload = jobRow.payload as Payload;

    if (jobRow.status === "completed" && jobRow.result)
      return { status: "completed" as const, ...(await signed(supabase, jobRow.result as Result)) };
    if (jobRow.status === "failed")
      return { status: "failed" as const, error: jobRow.error_message ?? "Generation failed." };
    if (jobRow.status === "rendering") return { status: "processing" as const, progress: 95 };

    const gw = await import("@/lib/video-gateway.server");
    const job = await gw.pollVideoJob(payload.gatewayId);

    if (job.status === "failed") {
      const msg = job.error?.message ?? "Video generation failed.";
      await supabase
        .from("video_jobs")
        .update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() })
        .eq("id", jobRow.id);
      return { status: "failed" as const, error: msg };
    }
    if (job.status !== "completed") {
      await supabase
        .from("video_jobs")
        .update({ progress: job.progress ?? 0 })
        .eq("id", jobRow.id);
      return { status: "processing" as const, progress: job.progress ?? 0 };
    }

    // Claim the save step so concurrent polls don't store twice.
    const claim = await supabase
      .from("video_jobs")
      .update({ status: "rendering" })
      .eq("id", jobRow.id)
      .eq("status", "generating")
      .select("id");
    if (!claim.data?.length) return { status: "processing" as const, progress: 95 };

    const removePaths = async (paths: string[]) => {
      if (paths.length) await supabase.storage.from("media").remove(paths);
    };
    const fail = async (msg: string, paths: string[] = []) => {
      await removePaths(paths);
      await supabase
        .from("video_jobs")
        .update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() })
        .eq("id", jobRow.id);
      return { status: "failed" as const, error: msg };
    };

    let assetId: string | null = null;
    const paths: string[] = [];
    try {
      const bytes = await gw.downloadVideo(payload.gatewayId);
      const base = `${jobRow.workspace_id}/generated/${crypto.randomUUID()}`;
      const videoPath = `${base}.mp4`;
      const captionsPath = `${base}.vtt`;
      const up1 = await supabase.storage
        .from("media")
        .upload(videoPath, bytes, { contentType: "video/mp4" });
      if (up1.error) return await fail(`Could not store video: ${up1.error.message}`);
      paths.push(videoPath);
      const vtt = gw.buildCaptionsVtt(payload.narration, payload.duration);
      const up2 = await supabase.storage
        .from("media")
        .upload(captionsPath, new TextEncoder().encode(vtt), { contentType: "text/vtt" });
      if (up2.error) return await fail(`Could not store captions: ${up2.error.message}`, paths);
      paths.push(captionsPath);

      // Create the Media Library entry before charging. The credit charge is the
      // final step, so a storage/save failure never charges the user, and a
      // charge failure rolls the orphaned entry and files back.
      const asset = await supabase
        .from("media_assets")
        .insert({
          workspace_id: jobRow.workspace_id,
          kind: "video",
          name: payload.name,
          folder: "Generated",
          storage_path: videoPath,
          mime_type: "video/mp4",
          size_bytes: bytes.byteLength,
          duration_seconds: payload.duration,
          tags: ["ai", "scene", "voiceover", "captions"],
          source: "ai_generated",
        })
        .select("id")
        .single();
      if (asset.error) return await fail(`Could not save the clip: ${asset.error.message}`, paths);
      assetId = asset.data.id;

      const charge = await supabase.rpc("consume_credits", {
        _workspace_id: jobRow.workspace_id,
        _amount: CREDIT_COSTS.sceneVideo,
        _reason: "Scene video clip",
      });
      if (charge.error) {
        await supabase.from("media_assets").delete().eq("id", assetId);
        return await fail(charge.error.message, paths);
      }

      const result: Result = { assetId, videoPath, captionsPath };
      const finalized = await supabase
        .from("video_jobs")
        .update({
          status: "completed",
          progress: 100,
          credits_consumed: CREDIT_COSTS.sceneVideo,
          result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobRow.id);
      // The clip exists and is paid for; a failed status write must not surface
      // as an error or trigger cleanup.
      if (finalized.error) {
        console.error(`[video] could not finalize job ${jobRow.id}: ${finalized.error.message}`);
      }

      return {
        status: "completed" as const,
        balance: charge.data as number,
        ...(await signed(supabase, result)),
      };
    } catch (e) {
      return await fail(e instanceof Error ? e.message : "Could not save the clip.", paths);
    }
  });
