import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_COSTS } from "@/lib/pricing";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { assertWorkspaceMember } from "@/lib/ownership";
import { enforceRateLimit } from "@/lib/rate-limit.server";

const SaveInput = z.object({
  workspaceId: z.string().uuid(),
  dataUrl: z.string().startsWith("data:image/").max(15_000_000),
  prompt: z.string().max(4000),
  name: z.string().min(1).max(200),
});

/**
 * Stores a finished scene image and charges credits.
 * Credits are only consumed after the image exists, so failed generations cost nothing.
 */
export const saveGeneratedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as unknown as { userId: string }).userId;
    await enforceRateLimit("image", userId);
    await assertWorkspaceMember(supabase, userId, data.workspaceId);
    const b64 = data.dataUrl.slice(data.dataUrl.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${data.workspaceId}/generated/${crypto.randomUUID()}.png`;

    const upload = await supabase.storage
      .from("media")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upload.error) throw new Error(`Could not store image: ${upload.error.message}`);

    await ensureMonthlyFreeCredits(supabase, data.workspaceId);

    // Create the Media Library entry before charging: a save failure never
    // charges the user, and a charge failure rolls the entry and file back.
    const asset = await supabase
      .from("media_assets")
      .insert({
        workspace_id: data.workspaceId,
        kind: "image",
        name: data.name,
        folder: "Generated",
        storage_path: path,
        mime_type: "image/png",
        size_bytes: bytes.byteLength,
        tags: ["ai", "scene"],
        source: "ai_generated",
      })
      .select("id")
      .single();
    if (asset.error) {
      await supabase.storage.from("media").remove([path]);
      throw new Error(asset.error.message);
    }

    const charge = await supabase.rpc("consume_credits", {
      _workspace_id: data.workspaceId,
      _amount: CREDIT_COSTS.sceneImage,
      _reason: "Scene image generation",
    });
    if (charge.error) {
      await supabase.from("media_assets").delete().eq("id", asset.data.id);
      await supabase.storage.from("media").remove([path]);
      throw new Error(charge.error.message);
    }

    const signed = await supabase.storage.from("media").createSignedUrl(path, 3600);
    return { assetId: asset.data.id, url: signed.data?.signedUrl ?? null, balance: charge.data };
  });
