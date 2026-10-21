export type ImageConfig = {
  provider: "pollinations" | "gemini";
  baseURL: string;
  model: string;
  apiKey: string;
  token?: string | undefined;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string };
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function isGemini(): boolean {
  return process.env["IMAGE_PROVIDER"] === "gemini";
}

export const imageSettings: Omit<ImageConfig, "apiKey"> = {
  provider: isGemini() ? "gemini" : "pollinations",
  baseURL: process.env["GEMINI_API_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta",
  model: isGemini()
    ? (process.env["GEMINI_IMAGE_MODEL"] ?? "gemini-3.1-flash-image")
    : (process.env["POLLINATIONS_MODEL"] ?? "flux"),
  token: process.env["POLLINATIONS_TOKEN"],
};

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Reshapes a finished image into the OpenAI-style SSE contract the client's
 * `streamImage` helper already parses, so the browser code needs no changes.
 */
function imageResponse(b64: string, mimeType: string, stream: boolean): Response {
  if (!stream) {
    return new Response(JSON.stringify({ data: [{ b64_json: b64, mimeType }] }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const sse =
    `event: image_generation.completed\n` +
    `data: ${JSON.stringify({ type: "image_generation.completed", b64_json: b64, mimeType })}\n\n`;
  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

/** Free image generation via Pollinations. With a token it uses the keyed
 *  gen.pollinations.ai endpoint (Bearer auth); otherwise the keyless legacy one. */
async function generatePollinations(
  config: ImageConfig,
  prompt: string,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const encoded = encodeURIComponent(prompt.slice(0, 1500));
  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    model: config.model,
  });
  const headers: Record<string, string> = {};
  let url: string;
  if (config.token) {
    url = `https://gen.pollinations.ai/image/${encoded}?${params}`;
    headers["Authorization"] = `Bearer ${config.token}`;
  } else {
    params.set("nologo", "true");
    url = `https://image.pollinations.ai/prompt/${encoded}?${params}`;
  }

  let last = "Image generation failed.";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1) + Math.random() * 500));
      signal?.throwIfAborted();
    }
    let res: Response;
    try {
      res = await fetch(url, { signal: signal ?? null, headers });
    } catch (error) {
      if (signal?.aborted) throw error;
      last = error instanceof Error ? error.message : "Network error contacting the image service.";
      continue;
    }
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength < 100) {
        last = "Image service returned an empty image.";
        continue;
      }
      return imageResponse(
        bytesToBase64(bytes),
        res.headers.get("content-type") ?? "image/jpeg",
        stream,
      );
    }
    last = (await res.text().catch(() => "")) || `Image service error (${res.status})`;
    // 402/429 mean the free tier is momentarily saturated; retry those and 5xx, fail fast otherwise.
    if (!(res.status === 402 || res.status === 429 || res.status >= 500)) break;
  }
  return errorResponse(last, 502);
}

/** Gemini image generation (requires a billing-enabled key; Gemini image has no free tier). */
async function generateGemini(
  config: ImageConfig,
  prompt: string,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  if (!config.apiKey) return errorResponse("Gemini image generation is not configured.", 500);

  const res = await fetch(`${config.baseURL}/models/${config.model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal: signal ?? null,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return errorResponse(body || `Image service error (${res.status})`, res.status);
  }

  const json = (await res.json().catch(() => ({}))) as GeminiImageResponse;
  const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!data?.data) {
    const reason =
      json.promptFeedback?.blockReason ??
      json.error?.message ??
      "Image generation returned no image.";
    return errorResponse(reason, 502);
  }

  return imageResponse(data.data, data.mimeType ?? "image/png", stream);
}

export function generateImage(
  config: ImageConfig,
  prompt: string,
  stream = true,
  signal?: AbortSignal,
): Promise<Response> {
  return config.provider === "gemini"
    ? generateGemini(config, prompt, stream, signal)
    : generatePollinations(config, prompt, stream, signal);
}
