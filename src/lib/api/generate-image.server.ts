/**
 * `POST /api/v1/generate-image` handler, shared with the deprecated
 * unversioned route so both stay byte-for-byte identical while `v0` ages out.
 *
 * Two authentication modes:
 *   - `session`  — browser JWT in `Authorization`; workspace access is checked
 *     by RLS through a user-scoped client (unchanged from the original route).
 *   - `signature`— HMAC-signed machine request; the signing key is the trust
 *     boundary, so the workspace is resolved with the service-role client and
 *     the caller is rate limited per key id.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateMutation,
  authenticationRequiredResponse,
  classifyMutationAuth,
} from "@/lib/request-signing.server";
import { generateImage } from "@/lib/image-gateway.server";
import { loadImageConfig } from "@/lib/platform-config.server";
import { CREDIT_COSTS } from "@/lib/pricing";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server";

const Body = z.object({
  prompt: z.string().min(3).max(4000),
  workspaceId: z.string().uuid(),
  stream: z.boolean().optional(),
});

function rateLimited(response: RateLimitError): Response {
  return new Response("Too many requests. Please try again shortly.", {
    status: 429,
    headers: { "Retry-After": String(response.retryAfterSeconds) },
  });
}

async function generateForWorkspace(
  db: SupabaseClient<Database>,
  workspaceId: string,
  { prompt, stream }: { prompt: string; stream: boolean },
): Promise<Response> {
  // RLS only returns the row for members of this workspace (service role skips
  // RLS and lands on the same existence check below).
  await ensureMonthlyFreeCredits(db, workspaceId);
  const { data: credits } = await db
    .from("usage_credits")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!credits) return new Response("Workspace not found.", { status: 403 });
  if (credits.balance < CREDIT_COSTS.sceneImage) {
    return new Response("Not enough credits for this image.", { status: 402 });
  }

  const config = await loadImageConfig();
  if (config.provider === "gemini" && !config.apiKey) {
    return new Response("Image generation is not configured.", { status: 500 });
  }

  const upstream = await generateImage(config, prompt, stream);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

export async function handleGenerateImage(ctx: { request: Request }): Promise<Response> {
  const { request } = ctx;
  // Reject anonymous calls before the body is buffered; signed requests then
  // verify against the raw body they committed to.
  if (classifyMutationAuth(request.headers) === null) return authenticationRequiredResponse();

  const rawBody = await request.text();
  const auth = await authenticateMutation(request, rawBody);
  if ("response" in auth) return auth.response;

  let json: unknown = null;
  try {
    json = rawBody === "" ? null : JSON.parse(rawBody);
  } catch {
    json = null;
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return new Response("Invalid request.", { status: 400 });
  const { prompt, workspaceId, stream = true } = parsed.data;

  if (auth.method === "signature") {
    try {
      await enforceRateLimit("image", `sig-${auth.keyId}`);
    } catch (error) {
      if (error instanceof RateLimitError) return rateLimited(error);
      throw error;
    }
    if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return new Response("Server configuration error.", { status: 500 });
    }
    const admin: SupabaseClient<Database> = supabaseAdmin;
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (!workspace) return new Response("Workspace not found.", { status: 403 });
    return generateForWorkspace(admin, workspaceId, { prompt, stream });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return new Response("Server configuration error.", { status: 500 });
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return new Response("Session expired.", { status: 401 });

  try {
    await enforceRateLimit("image", userData.user.id);
  } catch (error) {
    if (error instanceof RateLimitError) return rateLimited(error);
    throw error;
  }

  return generateForWorkspace(supabase, workspaceId, { prompt, stream });
}
