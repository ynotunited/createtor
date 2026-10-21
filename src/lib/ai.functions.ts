import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Output, streamText, type LanguageModel } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { createChatModels } from "@/lib/ai-gateway.server";
import { untrusted, withSafety } from "@/lib/ai-prompt";
import { CREDIT_COSTS } from "@/lib/pricing";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { assertWorkspaceMember } from "@/lib/ownership";
import { enforceRateLimit } from "@/lib/rate-limit.server";

/**
 * Runs a streaming structured-output request, automatically retrying with the
 * next configured provider when one fails (e.g. Gemini free-tier quota/429).
 *
 * The per-user AI rate limit is enforced here, at the single choke point every
 * paid chat call passes through, so a new call site can never forget it.
 */
async function withChatModelFallback<T>(
  userId: string,
  run: (model: LanguageModel, maxRetries: number) => Promise<T>,
): Promise<T> {
  await enforceRateLimit("ai", userId);

  const models = await createChatModels();
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!model) continue;
    const isLast = i === models.length - 1;
    // Fail fast on the primary provider so we can fall back quickly; only the
    // final provider benefits from the SDK's retry/backoff.
    const maxRetries = isLast ? 2 : 0;
    try {
      return await run(model, maxRetries);
    } catch (error) {
      lastError = error;
      if (!isLast) {
        console.warn(
          `[ai] provider #${i + 1} failed; trying fallback:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All AI providers failed.");
}

/**
 * Checks the balance before generating and charges only after the work
 * succeeds, so a failed generation never costs the user credits. The caller
 * must pass the workspace id it intends to charge, so credits are never
 * consumed from a crafted/duplicate/default workspace.
 */
async function chargeAfter<T>(
  supabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  amount: number,
  reason: string,
  run: () => Promise<T>,
): Promise<T> {
  // Defence in depth: RLS already scopes the user client, but assert membership
  // explicitly so a crafted workspace id can never spend another tenant's
  // credits if a policy is ever loosened.
  await assertWorkspaceMember(supabase, userId, workspaceId);

  // Free workspaces get their monthly allotment before the balance is checked.
  await ensureMonthlyFreeCredits(supabase, workspaceId);

  const { data: credits } = await supabase
    .from("usage_credits")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if ((credits?.balance ?? 0) < amount)
    throw new Error(`Not enough credits. This action needs ${amount}.`);

  const result = await run();

  const { error } = await supabase.rpc("consume_credits", {
    _workspace_id: workspaceId,
    _amount: amount,
    _reason: reason,
  });
  if (error) {
    console.error(`[credits] failed to charge ${amount}: ${error.message}`);
    throw new Error(
      "Your generation succeeded but the credit charge failed. Please contact support so we can reconcile your balance.",
    );
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Idea engine                                                                */
/* -------------------------------------------------------------------------- */

const IdeaRequest = z.object({
  workspaceId: z.string().uuid(),
  niche: z.string().min(2).max(200),
  audience: z.string().max(300).nullable(),
  platform: z.string().max(50),
  durationSeconds: z.number().int().min(10).max(1800),
  tone: z.string().max(60),
  language: z.string().max(40),
  count: z.number().int().min(1).max(8),
});

const IdeaSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      topic: z.string(),
      targetAudience: z.string(),
      suggestedFormat: z.string(),
      estimatedDurationSeconds: z.number(),
      emotionalAngle: z.string(),
      suggestedCta: z.string(),
      visualConcept: z.string(),
    }),
  ),
});

export type GeneratedIdeas = z.infer<typeof IdeaSchema>;

export const generateIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => IdeaRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    return await chargeAfter(
      context.supabase,
      userId,
      data.workspaceId,
      CREDIT_COSTS.ideaBatch,
      "Video ideas",
      () =>
        withChatModelFallback(userId, async (model, maxRetries) => {
          const result = streamText({
            model,
            maxRetries,
            output: Output.object({ schema: IdeaSchema }),
            system: withSafety(
              "You are a senior short-form and long-form video strategist. Produce specific, non-generic, non-clickbait content ideas grounded in the stated niche and audience. Never promise virality.",
            ),
            prompt: [
              `Generate exactly ${data.count} distinct video ideas.`,
              untrusted("niche", data.niche),
              untrusted("audience", data.audience ?? "not specified"),
              untrusted("platform", data.platform),
              `Target duration: about ${data.durationSeconds} seconds`,
              untrusted("tone", data.tone),
              untrusted("language", data.language),
              "Keep each field short: titles under 80 characters, hooks under 140 characters.",
            ].join("\n"),
          });

          return await result.output;
        }),
    );
  });

/* -------------------------------------------------------------------------- */
/* Trend research                                                             */
/* -------------------------------------------------------------------------- */

const ResearchRequest = z.object({
  niche: z.string().min(2).max(200),
  audience: z.string().max(300).nullable(),
  language: z.string().max(40),
  excludeTopics: z.array(z.string().max(200)).max(60),
});

const ResearchSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      category: z.string(),
      momentum: z.string(),
      rationale: z.string(),
    }),
  ),
});

export const researchTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ResearchRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    return await withChatModelFallback(userId, async (model, maxRetries) => {
      const result = streamText({
        model,
        maxRetries,
        output: Output.object({ schema: ResearchSchema }),
        system: withSafety(
          "You are a content research analyst. Suggest topics by category and be explicit that momentum labels are estimates from general knowledge, not live platform data.",
        ),
        prompt: [
          untrusted("niche", data.niche),
          untrusted("audience", data.audience ?? "not specified"),
          untrusted("language", data.language),
          "Return 12 topics spread across these categories: trending, rising, evergreen, question, content gap, competitor-inspired, seasonal.",
          "Momentum must be one of: trending, rising, evergreen, seasonal.",
          data.excludeTopics.length
            ? untrusted("already_used_topics", data.excludeTopics.join("; "))
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });

      return await result.output;
    });
  });

/* -------------------------------------------------------------------------- */
/* Script studio                                                              */
/* -------------------------------------------------------------------------- */

const ScriptRequest = z.object({
  workspaceId: z.string().uuid(),
  mode: z.enum([
    "generate",
    "rewrite",
    "expand",
    "shorten",
    "tone",
    "translate",
    "stronger_hook",
    "emotional",
    "educational",
    "storytelling",
  ]),
  topic: z.string().max(400),
  audience: z.string().max(300).nullable(),
  tone: z.string().max(60),
  language: z.string().max(40),
  targetDurationSeconds: z.number().int().min(15).max(1800),
  existingScript: z.string().max(20000).nullable(),
});

const ScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  introduction: z.string(),
  mainContent: z.string(),
  turningPoint: z.string(),
  payoff: z.string(),
  cta: z.string(),
});

export type GeneratedScript = z.infer<typeof ScriptSchema>;

const MODE_INSTRUCTIONS: Record<z.infer<typeof ScriptRequest>["mode"], string> = {
  generate: "Write a new script from the topic.",
  rewrite: "Rewrite the existing script, keeping its meaning but improving clarity and flow.",
  expand: "Expand the existing script with more depth and examples.",
  shorten: "Tighten the existing script, cutting filler while keeping the core message.",
  tone: "Rewrite the existing script in the requested tone.",
  translate: "Translate the existing script into the requested language, keeping structure.",
  stronger_hook: "Keep the script but rewrite the opening into a much stronger hook.",
  emotional: "Rewrite the script with a stronger emotional arc.",
  educational: "Rewrite the script as a clear educational explainer.",
  storytelling: "Rewrite the script as a narrative story with characters and stakes.",
};

export const generateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ScriptRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    const cost =
      data.mode === "generate" ? CREDIT_COSTS.scriptGenerate : CREDIT_COSTS.scriptRewrite;
    const reason = data.mode === "generate" ? "Script" : `Script: ${data.mode}`;
    return await chargeAfter(context.supabase, userId, data.workspaceId, cost, reason, () =>
      withChatModelFallback(userId, async (model, maxRetries) => {
        const result = streamText({
          model,
          maxRetries,
          output: Output.object({ schema: ScriptSchema }),
          system: withSafety(
            "You are an expert video scriptwriter. Write spoken narration only — no camera directions, no stage notes, no markdown. Keep sentences speakable.",
          ),
          prompt: [
            MODE_INSTRUCTIONS[data.mode],
            untrusted("topic", data.topic),
            untrusted("audience", data.audience ?? "general"),
            untrusted("tone", data.tone),
            untrusted("language", data.language),
            `Target spoken duration: about ${data.targetDurationSeconds} seconds (assume ~150 words per minute).`,
            data.existingScript ? untrusted("existing_script", data.existingScript) : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });

        return await result.output;
      }),
    );
  });

/* -------------------------------------------------------------------------- */
/* Storyboard                                                                 */
/* -------------------------------------------------------------------------- */

const StoryboardRequest = z.object({
  workspaceId: z.string().uuid(),
  script: z.string().min(20).max(20000),
  visualStyle: z.string().max(80),
  targetDurationSeconds: z.number().int().min(15).max(1800),
  characterDescription: z.string().max(1200).nullable(),
});

const StoryboardSchema = z.object({
  scenes: z.array(
    z.object({
      sceneNumber: z.number(),
      narration: z.string(),
      visualDescription: z.string(),
      imagePrompt: z.string(),
      videoPrompt: z.string(),
      cameraMovement: z.string(),
      emotion: z.string(),
      environment: z.string(),
      lighting: z.string(),
      durationSeconds: z.number(),
      transition: z.string(),
    }),
  ),
});

export type GeneratedStoryboard = z.infer<typeof StoryboardSchema>;

export const generateStoryboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => StoryboardRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    return await chargeAfter(
      context.supabase,
      userId,
      data.workspaceId,
      CREDIT_COSTS.storyboard,
      "Storyboard",
      () =>
        withChatModelFallback(userId, async (model, maxRetries) => {
          const result = streamText({
            model,
            maxRetries,
            output: Output.object({ schema: StoryboardSchema }),
            system: withSafety(
              "You are a storyboard director. Split narration into scenes of 3-8 seconds each and write production-ready image and video prompts.",
            ),
            prompt: [
              untrusted("visual_style", data.visualStyle),
              `Total duration target: ${data.targetDurationSeconds} seconds`,
              data.characterDescription
                ? untrusted("recurring_character", data.characterDescription)
                : "",
              untrusted("script", data.script),
            ]
              .filter(Boolean)
              .join("\n"),
          });

          return await result.output;
        }),
    );
  });

/* -------------------------------------------------------------------------- */
/* Platform metadata                                                          */
/* -------------------------------------------------------------------------- */

const MetadataRequest = z.object({
  script: z.string().min(20).max(20000),
  platform: z.string().max(40),
  language: z.string().max(40),
});

const MetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  hook: z.string(),
});

export const generateMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => MetadataRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    // Metadata is not credit-charged; the per-user AI rate limit (enforced inside
    // withChatModelFallback) is its guard against paid-API abuse.
    return await withChatModelFallback(userId, async (model, maxRetries) => {
      const result = streamText({
        model,
        maxRetries,
        output: Output.object({ schema: MetadataSchema }),
        system: withSafety(
          "You write platform-native video metadata. No clickbait that misrepresents the content.",
        ),
        prompt: [
          untrusted("platform", data.platform),
          untrusted("language", data.language),
          untrusted("script", data.script),
        ].join("\n"),
      });

      return await result.output;
    });
  });

/* -------------------------------------------------------------------------- */
/* Analytics agent                                                            */
/* -------------------------------------------------------------------------- */

const InsightRequest = z.object({
  rows: z
    .array(
      z.object({
        topic: z.string().max(300).nullable(),
        hookType: z.string().max(120).nullable(),
        platform: z.string().max(60).nullable(),
        durationSeconds: z.number().min(0).max(86_400).nullable(),
        views: z.number().int().min(0).max(1_000_000_000_000),
        engagementRate: z.number().min(0).max(1_000_000_000).nullable(),
        retentionPercent: z.number().min(0).max(100).nullable(),
        postingTime: z.string().max(60).nullable(),
      }),
    )
    .max(500),
});

const InsightSchema = z.object({
  summary: z.string(),
  insights: z.array(z.object({ observation: z.string(), recommendation: z.string() })),
});

export const generateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InsightRequest.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as unknown as { userId: string }).userId;
    if (data.rows.length === 0) {
      return {
        summary:
          "Not enough published performance data yet. Publish a few videos to unlock pattern analysis.",
        insights: [],
      };
    }

    return await withChatModelFallback(userId, async (model, maxRetries) => {
      const result = streamText({
        model,
        maxRetries,
        output: Output.object({ schema: InsightSchema }),
        system: withSafety(
          "You are a performance analyst. Base every statement strictly on the supplied rows, state sample sizes, and never promise virality or guaranteed results.",
        ),
        prompt: `Analyse this performance data and identify patterns:\n${untrusted("performance_rows", JSON.stringify(data.rows))}`,
      });

      return await result.output;
    });
  });
