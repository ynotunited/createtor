export type GatewayVideoJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { code: string; message: string };
};

/**
 * Video clip generation is off by default. Enable it by adding a paid
 * (trial-credit) provider key to your environment, e.g. from fal.ai:
 *
 *   VIDEO_API_KEY=...            # your fal.ai key (or set FAL_KEY)
 *   VIDEO_MODEL=fal-ai/veo3.1    # any fal video model (optional)
 *
 * Until a key is present, generate scene images and use the built-in browser
 * renderer to assemble the final video.
 */
const NOT_CONFIGURED =
  "Video clip generation is not configured on this deployment. Add VIDEO_API_KEY (fal.ai) to your .env to " +
  "enable it. Until then, generate scene images and use the built-in browser renderer to assemble your video.";

const FAL_QUEUE = "https://queue.fal.run";

function config() {
  return {
    apiKey: process.env["VIDEO_API_KEY"] || process.env["FAL_KEY"] || "",
    provider: (process.env["VIDEO_PROVIDER"] || "fal").toLowerCase(),
    model: process.env["VIDEO_MODEL"] || "fal-ai/veo3.1",
  };
}

function ensureFal() {
  const cfg = config();
  if (!cfg.apiKey) throw new Error(NOT_CONFIGURED);
  if (cfg.provider !== "fal")
    throw new Error(
      `Unsupported VIDEO_PROVIDER "${cfg.provider}". Only "fal" is supported right now.`,
    );
  return cfg;
}

async function fal(
  path: string,
  init?: { method?: string; body?: string; apiKey: string },
): Promise<unknown> {
  const res = await fetch(`${FAL_QUEUE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Key ${init?.apiKey}`,
      "Content-Type": "application/json",
    },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok)
    throw new Error(
      errorMessage(body, text || `The video provider rejected the request (HTTP ${res.status}).`),
    );
  return body;
}

function errorMessage(body: unknown, fallback: string): string {
  const b = body as { detail?: unknown; error?: unknown } | null;
  const detail = b?.detail;
  if (Array.isArray(detail)) {
    const msg = (detail[0] as { msg?: string } | undefined)?.msg;
    if (typeof msg === "string") return msg;
  }
  if (typeof detail === "string") return detail;
  if (typeof b?.error === "string") return b.error;
  return fallback;
}

/** fal only accepts 4s / 6s / 8s clips — snap our desired length to the nearest. */
function falDuration(seconds: number): "4s" | "6s" | "8s" {
  if (seconds <= 5) return "4s";
  if (seconds <= 7) return "6s";
  return "8s";
}

const encodeId = (model: string, requestId: string) => `${model}::${requestId}`;
/** Only fal-hosted models are allowed to be looked up, whatever the stored id contains. */
function decodeId(id: string): { model: string; requestId: string } {
  const i = id.indexOf("::");
  if (i < 0) throw new Error("Invalid video job id.");
  const model = id.slice(0, i);
  const requestId = id.slice(i + 2);
  const configured = config().model;
  if (model !== configured && !model.startsWith("fal-ai/"))
    throw new Error("Unsupported video model.");
  if (!requestId || /[^a-zA-Z0-9_-]/.test(requestId)) throw new Error("Invalid video job id.");
  return { model, requestId };
}

export async function createVideoJob(
  prompt: string,
  durationSeconds: number,
  aspectRatio: "16:9" | "9:16",
): Promise<GatewayVideoJob> {
  const { apiKey, model } = ensureFal();
  const body = (await fal(`/${model}`, {
    method: "POST",
    apiKey,
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      duration: falDuration(durationSeconds),
      resolution: process.env["VIDEO_RESOLUTION"] || "720p",
      generate_audio: true,
    }),
  })) as { request_id?: string } | null;
  if (!body?.request_id) throw new Error("The video provider did not return a request id.");
  return { id: encodeId(model, body.request_id), status: "queued" };
}

type FalStatus = {
  status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
  queue_position?: number;
  error?: string;
  error_type?: string;
};

export async function pollVideoJob(id: string): Promise<GatewayVideoJob> {
  const { apiKey } = ensureFal();
  const { model, requestId } = decodeId(id);
  const body = (await fal(`/${model}/requests/${requestId}/status`, {
    apiKey,
  })) as FalStatus | null;
  if (body?.status === "COMPLETED") {
    if (body.error)
      return {
        id,
        status: "failed",
        error: { code: body.error_type ?? "generation_error", message: body.error },
      };
    return { id, status: "completed", progress: 100 };
  }
  if (body?.status === "IN_PROGRESS") return { id, status: "in_progress", progress: 60 };
  return { id, status: "queued", progress: Math.max(5, 20 - (body?.queue_position ?? 0)) };
}

export async function downloadVideo(id: string): Promise<Uint8Array> {
  const { apiKey } = ensureFal();
  const { model, requestId } = decodeId(id);
  const body = (await fal(`/${model}/requests/${requestId}`, { apiKey })) as {
    video?: { url?: string };
  } | null;
  const url = body?.video?.url;
  if (!url) throw new Error("The video provider did not return a downloadable video.");

  // Only ever fetch media from fal's own storage hosts; never follow
  // attacker-influenced redirect targets from a first-party host to an
  // internal one or a foreign URL.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The video provider returned an invalid download URL.");
  }
  const allowedHosts = ["queue.fal.run", "storage.fal.ai", "fal.media", "fal.ai"];
  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname))
    throw new Error("The video provider returned an invalid download URL.");

  let res = await fetch(parsed, { redirect: "manual" });
  const redirect = res.headers.get("location");
  if (redirect) {
    let r: URL;
    try {
      r = new URL(redirect, parsed);
    } catch {
      throw new Error("The video provider returned an invalid download URL.");
    }
    if (r.protocol !== "https:" || !allowedHosts.includes(r.hostname))
      throw new Error("The video provider returned an invalid download URL.");
    // The redirect target passed the allowlist; follow it to the actual blob.
    res = await fetch(r, { redirect: "follow" });
  }
  if (!res.ok) throw new Error(`Could not download the rendered video (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Word-grouped WebVTT captions spread evenly across the clip. */
export function buildCaptionsVtt(narration: string, durationSeconds: number) {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(" "));
  const per = durationSeconds / Math.max(chunks.length, 1);
  const ts = (s: number) => {
    const ms = Math.round(s * 1000);
    const mm = String(Math.floor(ms / 60000)).padStart(2, "0");
    const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `00:${mm}:${ss}.${String(ms % 1000).padStart(3, "0")}`;
  };
  return (
    "WEBVTT\n\n" +
    chunks.map((c, i) => `${i + 1}\n${ts(i * per)} --> ${ts((i + 1) * per)}\n${c}\n`).join("\n")
  );
}
