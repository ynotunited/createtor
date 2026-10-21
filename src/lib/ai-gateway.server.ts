import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { loadAiRuntime } from "@/lib/platform-config.server";

/**
 * Server-only LLM provider factory for chat/structured-output features.
 *
 * Provider config (keys, models, base URLs) is resolved per request from
 * `system_settings` with environment fallback, so an admin can rotate keys or
 * switch models without a redeploy. Keys never reach the client.
 *
 * Primary provider is Google Gemini. OpenAI-compatible providers (Groq, then
 * OpenRouter/generic env fallbacks) run as an automatic fallback for when the
 * primary hits its free-tier quota (HTTP 429) or is overloaded.
 */

/** Ordered list of chat models to try: primary Gemini first, then fallbacks. */
export async function createChatModels(): Promise<LanguageModel[]> {
  const runtime = await loadAiRuntime();
  const models: LanguageModel[] = [];

  if (runtime.google.enabled && runtime.google.apiKey) {
    const provider = createGoogleGenerativeAI({
      apiKey: runtime.google.apiKey,
      baseURL: runtime.google.baseUrl,
    });
    models.push(provider(runtime.google.model));
  }

  if (runtime.groq.enabled && runtime.groq.apiKey) {
    const provider = createOpenAI({ apiKey: runtime.groq.apiKey, baseURL: runtime.groq.baseUrl });
    models.push(provider.chat(runtime.groq.model));
  }

  const openrouterKey = process.env["OPENROUTER_API_KEY"];
  if (openrouterKey) {
    const provider = createOpenAI({
      apiKey: openrouterKey,
      baseURL: process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1",
    });
    models.push(
      provider.chat(process.env["OPENROUTER_MODEL"] ?? "meta-llama/llama-3.3-70b-instruct:free"),
    );
  }

  const genericKey = process.env["FALLBACK_AI_API_KEY"];
  const genericBase = process.env["FALLBACK_AI_BASE_URL"];
  if (genericKey && genericBase) {
    const provider = createOpenAI({ apiKey: genericKey, baseURL: genericBase });
    models.push(provider.chat(process.env["FALLBACK_AI_MODEL"] ?? "gpt-4o-mini"));
  }

  if (models.length === 0) {
    throw new Error("Generation is not configured for this workspace yet.");
  }
  return models;
}

export async function createChatModel(): Promise<LanguageModel> {
  const models = await createChatModels();
  return models[0]!;
}
