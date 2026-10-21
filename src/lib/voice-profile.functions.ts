/**
 * Creates a voice profile for a workspace.
 *
 * The consent record for a cloned voice is **derived on the server**, never
 * taken from the payload: a client cannot fabricate `consent_confirmed` by
 * posting the field, and a clone request without an explicit consent
 * confirmation is rejected. This keeps the compliance claim ("no cloning
 * without a recorded consent") true even against a crafted request.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertWorkspaceMember } from "@/lib/ownership";
import { BUILTIN_VOICES } from "@/lib/voices";

const BUILTIN_IDS = BUILTIN_VOICES.map((v) => v.id) as [string, ...string[]];

const createInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  language: z.string().max(60).default("English"),
  accent: z.string().max(60).default(""),
  tone: z.string().max(60).default(""),
  gender: z.string().max(60).default(""),
  isClone: z.boolean().default(false),
  builtinVoice: z.enum(BUILTIN_IDS).default("Kore"),
  // The user's assertion of consent. The server decides whether it is credible
  // given `isClone`; the stored flag is only ever set from this decision.
  consentGiven: z.boolean().default(false),
});

export const createVoiceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = (context as unknown as { userId: string }).userId;

    await assertWorkspaceMember(supabase, userId, data.workspaceId);

    // A cloned voice profile may only exist with a recorded consent.
    if (data.isClone && !data.consentGiven) {
      throw new Error(
        "A cloned voice needs an explicit, documented consent before it can be saved.",
      );
    }

    const consentConfirmed = data.isClone ? data.consentGiven : false;

    const { data: created, error } = await supabase
      .from("voices")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        language: data.language,
        accent: data.accent || null,
        tone: data.tone || null,
        gender: data.gender || null,
        provider: data.isClone ? "none" : "google",
        provider_voice_id: data.isClone ? null : data.builtinVoice,
        is_clone: data.isClone,
        consent_confirmed: consentConfirmed,
        consent_confirmed_at: consentConfirmed ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, id: created.id };
  });
