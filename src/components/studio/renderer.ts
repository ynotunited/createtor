import type { Cue } from "@/lib/vtt";

export type Aspect = "16:9" | "9:16" | "1:1";
export type CaptionStyle = "standard" | "bold" | "cinematic" | "minimal" | "karaoke" | "social";
export type CaptionPosition = "bottom" | "center" | "top";

export type RenderClip = {
  url: string;
  /** Defaults to "video" for backwards compatibility. */
  type?: "video" | "image";
  /** Seconds a still image is shown for (ignored for videos, which use their own length). */
  duration?: number;
};

export type RenderInput = {
  clips: RenderClip[];
  aspect: Aspect;
  clipVolume: number;
  voiceover: { url: string; volume: number } | null;
  music: { url: string; volume: number; duck: boolean } | null;
  captions: Cue[];
  captionStyle: CaptionStyle;
  captionPosition: CaptionPosition;
  onProgress: (p: number) => void;
  signal: AbortSignal;
};

const SIZES: Record<Aspect, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1080, 1080],
};

/** How long a still image stays on screen when no explicit duration is given. */
const DEFAULT_IMAGE_SECONDS = 4;
/** Maximum Ken Burns zoom-in applied across a still image. */
const KEN_BURNS_ZOOM = 0.08;

type LoadedVideo = { kind: "video"; el: HTMLVideoElement; duration: number };
type LoadedImage = { kind: "image"; el: HTMLImageElement; duration: number };
type Loaded = LoadedVideo | LoadedImage;

export function pickMimeType() {
  // WebM is chosen first: Chrome's MediaRecorder MP4 path has been observed to
  // produce an empty file. Browsers without WebM (Safari) fall through to MP4.
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
  ];
  return (
    options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ??
    "video/webm"
  );
}

function load<T extends HTMLMediaElement>(el: T, url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.oncanplaythrough = () => resolve(el);
    el.onerror = () =>
      reject(
        new Error("A media file could not be loaded. Its link may have expired — reload the page."),
      );
    el.src = url;
    el.load();
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error("An image could not be loaded. Its link may have expired — reload the page."),
      );
    img.src = url;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cue: Cue,
  t: number,
  style: CaptionStyle,
  pos: CaptionPosition,
) {
  const base = Math.round(
    Math.min(W, H) *
      (style === "bold" || style === "social" ? 0.07 : style === "minimal" ? 0.045 : 0.055),
  );
  const weight = style === "minimal" ? 500 : style === "cinematic" ? 600 : 800;
  const family = style === "cinematic" ? "Georgia, serif" : "Montserrat, Inter, sans-serif";
  ctx.font = `${weight} ${base}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = style === "social" || style === "bold" ? cue.text.toUpperCase() : cue.text;
  const lines = wrap(ctx, text, W * 0.84);
  const lh = base * 1.25;
  const blockH = lines.length * lh;
  const y0 = pos === "top" ? H * 0.12 : pos === "center" ? H / 2 - blockH / 2 : H * 0.86 - blockH;

  if (style === "standard" || style === "karaoke") {
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(
      W / 2 - maxW / 2 - base * 0.4,
      y0 - base * 0.2,
      maxW + base * 0.8,
      blockH + base * 0.4,
    );
  }
  const progress = Math.min(1, Math.max(0, (t - cue.start) / Math.max(0.01, cue.end - cue.start)));
  const allWords = text.split(" ");
  const spoken = Math.ceil(progress * allWords.length);
  let wordIndex = 0;

  lines.forEach((line, i) => {
    const y = y0 + i * lh + lh / 2;
    if (style === "karaoke" || style === "social") {
      const ws = line.split(" ");
      const total = ctx.measureText(line).width;
      let x = W / 2 - total / 2;
      ctx.textAlign = "left";
      for (const w of ws) {
        const lit = wordIndex < spoken;
        ctx.lineWidth = base * 0.14;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        if (style === "social") ctx.strokeText(w, x, y);
        ctx.fillStyle = lit ? (style === "social" ? "#FFE14D" : "#7CF0FF") : "#FFFFFF";
        ctx.fillText(w, x, y);
        x += ctx.measureText(w + " ").width;
        wordIndex++;
      }
      ctx.textAlign = "center";
      return;
    }
    if (style === "bold" || style === "cinematic" || style === "minimal") {
      ctx.lineWidth = style === "bold" ? base * 0.16 : base * 0.08;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(line, W / 2, y);
    }
    ctx.fillStyle = style === "cinematic" ? "#F4E9D0" : "#FFFFFF";
    ctx.fillText(line, W / 2, y);
  });
}

/** Renders clips/images + voiceover + music + burned-in captions to a single video file, in real time. */
export async function renderVideo(
  input: RenderInput,
): Promise<{ blob: Blob; mimeType: string; duration: number }> {
  const [W, H] = SIZES[input.aspect];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Declared outside the try so the finally block can release everything, even
  // when setup throws part-way through (e.g. a media element fails to load).
  let loaded: Loaded[] = [];
  let vo: HTMLAudioElement | null = null;
  let music: HTMLAudioElement | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const audioCtx = new AudioContext();

  try {
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    const narration = audioCtx.createGain();
    narration.connect(dest);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    narration.connect(analyser);

    loaded = await Promise.all(
      input.clips.map(async (c): Promise<Loaded> => {
        if (c.type === "image") {
          const el = await loadImage(c.url);
          const duration = c.duration && c.duration > 0 ? c.duration : DEFAULT_IMAGE_SECONDS;
          return { kind: "image", el, duration };
        }
        const el = await load(document.createElement("video"), c.url);
        const duration = Number.isFinite(el.duration) ? el.duration : (c.duration ?? 0);
        return { kind: "video", el, duration };
      }),
    );
    loaded.forEach((s) => {
      if (s.kind !== "video") return;
      const g = audioCtx.createGain();
      g.gain.value = input.clipVolume;
      audioCtx.createMediaElementSource(s.el).connect(g).connect(narration);
    });

    if (input.voiceover) {
      vo = await load(new Audio(), input.voiceover.url);
      const g = audioCtx.createGain();
      g.gain.value = input.voiceover.volume;
      audioCtx.createMediaElementSource(vo).connect(g).connect(narration);
    }
    const voDuration = vo && Number.isFinite(vo.duration) ? vo.duration : 0;

    const images = loaded.filter((s): s is LoadedImage => s.kind === "image");
    // When the timeline is a still-image slideshow with a narration track, stretch
    // each image to fill the voiceover so slides stay in sync with the audio.
    if (images.length && images.length === loaded.length && voDuration > 0) {
      const each = voDuration / images.length;
      images.forEach((s) => (s.duration = each));
    }

    const starts: number[] = [];
    let acc = 0;
    for (const s of loaded) {
      starts.push(acc);
      acc += s.duration;
    }
    const clipTotal = acc;

    let musicGain: GainNode | null = null;
    if (input.music) {
      music = await load(new Audio(), input.music.url);
      music.loop = true;
      musicGain = audioCtx.createGain();
      musicGain.gain.value = input.music.volume;
      audioCtx.createMediaElementSource(music).connect(musicGain).connect(dest);
    }

    const total = Math.max(clipTotal, voDuration);
    if (!total) throw new Error("Nothing to render — add at least one clip.");

    stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (recorder!.onstop = () => r()));

    const segmentAt = (t: number) => {
      for (let i = 0; i < loaded.length; i++) {
        if (t < (starts[i] ?? 0) + (loaded[i]?.duration ?? 0)) return i;
      }
      return loaded.length - 1;
    };

    const drawCover = (el: HTMLVideoElement | HTMLImageElement, zoom = 0) => {
      const elW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const elH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (!elW || !elH) return;
      const s = Math.max(W / elW, H / elH) * (1 + KEN_BURNS_ZOOM * zoom);
      const dw = elW * s;
      const dh = elH * s;
      ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    };

    const drawFrame = (t: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const seg = loaded[segmentAt(t)];
      if (seg) {
        if (seg.kind === "image") {
          const p =
            seg.duration > 0
              ? Math.min(1, Math.max(0, (t - (starts[segmentAt(t)] ?? 0)) / seg.duration))
              : 0;
          drawCover(seg.el, p);
        } else {
          drawCover(seg.el);
        }
      }
      const cue = input.captions.find((c) => t >= c.start && t < c.end);
      if (cue) drawCaption(ctx, W, H, cue, t, input.captionStyle, input.captionPosition);
    };

    let activeIndex = -1;
    const setActive = (idx: number, t: number) => {
      if (idx === activeIndex) return;
      const prev = loaded[activeIndex];
      if (prev?.kind === "video") prev.el.pause();
      activeIndex = idx;
      const seg = loaded[idx];
      if (seg?.kind === "video") {
        const local = Math.max(0, t - (starts[idx] ?? 0));
        if (Math.abs(seg.el.currentTime - local) > 0.3) seg.el.currentTime = local;
        void seg.el.play();
      }
    };

    drawFrame(0);
    setActive(segmentAt(0), 0);
    recorder.start(1000);
    const t0 = performance.now();
    vo?.play();
    music?.play();
    const buf = new Uint8Array(analyser.fftSize);

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (input.signal.aborted) return reject(new DOMException("Render cancelled", "AbortError"));
        const t = (performance.now() - t0) / 1000;
        setActive(segmentAt(t), t);
        if (musicGain && input.music) {
          let target = input.music.volume;
          if (input.music.duck) {
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (const b of buf) sum += ((b - 128) / 128) ** 2;
            if (Math.sqrt(sum / buf.length) > 0.02) target *= 0.25;
          }
          if (t > total - 1.5) target *= Math.max(0, (total - t) / 1.5);
          musicGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.15);
        }
        drawFrame(t);
        input.onProgress(Math.min(99, (t / total) * 100));
        if (t >= total) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Flush the recorder and wait for the final data chunk before building the blob.
    recorder.stop();
    await stopped;

    const type = mimeType.split(";")[0] ?? "video/webm";
    const blob = new Blob(chunks, { type });
    if (!blob.size)
      throw new Error(
        "The render finished but produced an empty file. Your browser's recorder returned no data — try a different browser, or close other heavy tabs and render again.",
      );
    input.onProgress(100);
    return { blob, mimeType: type, duration: total };
  } finally {
    // Always release media, capture tracks and the audio graph, including on
    // abort or any error during setup — a leaked AudioContext (browsers cap the
    // number of live contexts) would otherwise break every later render.
    loaded.forEach((s) => s.kind === "video" && s.el.pause());
    vo?.pause();
    music?.pause();
    stream?.getTracks().forEach((track) => track.stop());
    if (recorder && recorder.state !== "inactive") recorder.stop();
    try {
      await audioCtx.close();
    } catch {
      // Closing an already-closed/never-opened context is not actionable.
    }
  }
}
