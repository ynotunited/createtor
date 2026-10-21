import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_COSTS } from "@/lib/pricing";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { assertWorkspaceMember } from "@/lib/ownership";
import { enforceRateLimit } from "@/lib/rate-limit.server";
import { VOICE_IDS, voiceoverCost } from "@/lib/voices";

const Input = z.object({
  workspaceId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
  voice: z.enum(VOICE_IDS),
  direction: z.string().max(120).default(""),
  name: z.string().min(1).max(200),
  preview: z.boolean().default(false),
});

function captionsVtt(text: string, duration: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 5) chunks.push(words.slice(i, i + 5).join(" "));
  // Weight each caption by its character length so timing follows speech pace.
  const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
  const ts = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, "0")}`;
  };
  let t = 0;
  const cues = chunks.map((c, i) => {
    const d = (c.length / total) * duration;
    const cue = `${i + 1}\n${ts(t)} --> ${ts(t + d)}\n${c}\n`;
    t += d;
    return cue;
  });
  return "WEBVTT\n\n" + cues.join("\n");
}

/**
 * Generates narration audio (WAV) + timed captions, stores both, then charges credits.
 * Previews are short, cost 1 credit and are not added to the Media Library.
 */
export const generateVoiceover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as unknown as { userId: string }).userId;
    await enforceRateLimit("voice", userId);
    const text = data.preview ? data.text.slice(0, 200) : data.text;
    const cost = data.preview ? 1 : voiceoverCost(text, CREDIT_COSTS.voiceoverPerMinute);

    await assertWorkspaceMember(supabase, userId, data.workspaceId);
    await ensureMonthlyFreeCredits(supabase, data.workspaceId);

    const credits = await supabase
      .from("usage_credits")
      .select("balance")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (credits.error) throw new Error(credits.error.message);
    if ((credits.data?.balance ?? 0) < cost)
      throw new Error(`Not enough credits. This needs ${cost}.`);

    const { synthesizeSpeech } = await import("@/lib/speech.server");
    const { loadAiRuntime } = await import("@/lib/platform-config.server");
    const ai = await loadAiRuntime();
    const { wav, durationSeconds } = await synthesizeSpeech(
      text,
      data.voice,
      data.direction || undefined,
      { apiKey: ai.google.apiKey || undefined, base: ai.google.baseUrl },
    );

    const base = `${data.workspaceId}/${data.preview ? "previews" : "voiceovers"}/${crypto.randomUUID()}`;
    const audioPath = `${base}.wav`;
    const captionsPath = `${base}.vtt`;
    const paths = [audioPath];
    const up = await supabase.storage
      .from("media")
      .upload(audioPath, wav, { contentType: "audio/wav" });
    if (up.error) throw new Error(`Could not store audio: ${up.error.message}`);
    if (!data.preview) {
      const up2 = await supabase.storage
        .from("media")
        .upload(captionsPath, new TextEncoder().encode(captionsVtt(text, durationSeconds)), {
          contentType: "text/vtt",
        });
      if (up2.error) {
        await supabase.storage.from("media").remove(paths);
        throw new Error(`Could not store captions: ${up2.error.message}`);
      }
      paths.push(captionsPath);
    }

    // Create the Media Library entry before charging: a save failure never
    // charges the user, and a charge failure rolls the entry and files back.
    let assetId: string | null = null;
    if (!data.preview) {
      const asset = await supabase
        .from("media_assets")
        .insert({
          workspace_id: data.workspaceId,
          kind: "audio",
          name: data.name,
          folder: "Voiceovers",
          storage_path: audioPath,
          mime_type: "audio/wav",
          size_bytes: wav.byteLength,
          duration_seconds: Math.round(durationSeconds * 10) / 10,
          tags: ["ai", "voiceover", "captions", data.voice.toLowerCase()],
          source: "ai_generated",
        })
        .select("id")
        .single();
      if (asset.error) {
        await supabase.storage.from("media").remove(paths);
        throw new Error(asset.error.message);
      }
      assetId = asset.data.id;
    }

    const charge = await supabase.rpc("consume_credits", {
      _workspace_id: data.workspaceId,
      _amount: cost,
      _reason: data.preview ? "Voice preview" : "Voiceover generation",
    });
    if (charge.error) {
      if (assetId) await supabase.from("media_assets").delete().eq("id", assetId);
      await supabase.storage.from("media").remove(paths);
      throw new Error(charge.error.message);
    }

    const signed = await supabase.storage.from("media").createSignedUrl(audioPath, 3600);
    return {
      assetId,
      url: signed.data?.signedUrl ?? null,
      durationSeconds,
      cost,
      balance: charge.data as number,
    };
  });
