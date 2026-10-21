const BASE =
  process.env["GEMINI_API_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta";
export const SPEECH_MODEL = process.env["GEMINI_TTS_MODEL"] ?? "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE = 24000;

function key(override?: string) {
  const k = override || process.env["GOOGLE_AI_API_KEY"];
  if (!k) throw new Error("Voice generation is not configured for this workspace yet.");
  return k;
}

/** Splits text at sentence boundaries into chunks of at most ~700 characters. */
export function chunkText(text: string, max = 700): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function isWav(buf: Uint8Array): boolean {
  return (
    buf.byteLength > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
  );
}

function pcmFromWav(buf: Uint8Array): Uint8Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = String.fromCharCode(buf[off]!, buf[off + 1]!, buf[off + 2]!, buf[off + 3]!);
    const size = view.getUint32(off + 4, true);
    if (id === "data") return buf.subarray(off + 8, Math.min(off + 8 + size, buf.byteLength));
    off += 8 + size + (size % 2);
  }
  throw new Error("The voice service returned unreadable audio.");
}

function wavFromPcm(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
  error?: { message?: string };
};

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function synthChunk(
  text: string,
  voice: string,
  settings: { apiKey: string; base: string; model: string },
  attempt = 0,
): Promise<Uint8Array> {
  const res = await fetch(`${settings.base}/models/${settings.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": settings.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500));
      return synthChunk(text, voice, settings, attempt + 1);
    }
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    const msg = body?.message ?? body?.error?.message ?? `Voice service error (${res.status})`;
    if (res.status === 402) throw new Error("Out of generation credits for this workspace. " + msg);
    if (res.status === 429)
      throw new Error("The voice service is busy. Please try again in a moment.");
    throw new Error(msg);
  }
  const json = (await res.json()) as GeminiTtsResponse;
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    ?.data;
  if (!b64) throw new Error("The voice service returned unreadable audio.");
  const raw = decodeBase64(b64);
  // Gemini returns raw 24kHz PCM; strip a WAV header if one ever slips through.
  return isWav(raw) ? pcmFromWav(raw) : raw;
}

/** Synthesizes the full text in order and returns one WAV file plus its real duration. */
export async function synthesizeSpeech(
  text: string,
  voice: string,
  direction?: string,
  overrides?: {
    apiKey?: string | undefined;
    base?: string | undefined;
    model?: string | undefined;
  },
) {
  const settings = {
    apiKey: key(overrides?.apiKey),
    base: overrides?.base || BASE,
    model: overrides?.model || SPEECH_MODEL,
  };
  const chunks = chunkText(text);
  // Synthesize up to 3 chunks at a time, keeping their original order.
  const parts: Uint8Array[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      const c = chunks[i]!;
      parts[i] = await synthChunk(direction ? `${direction}: ${c}` : c, voice, settings);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const pcm = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    pcm.set(p, o);
    o += p.byteLength;
  }
  return { wav: wavFromPcm(pcm), durationSeconds: total / 2 / SAMPLE_RATE };
}
