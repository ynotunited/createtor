export type Cue = { start: number; end: number; text: string };

function toSec(t: string) {
  const p = t.trim().split(":").map(Number);
  return p.length === 3 ? p[0]! * 3600 + p[1]! * 60 + p[2]! : p[0]! * 60 + p[1]!;
}

/** Minimal WebVTT parser (timings + text only). */
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i]!.split("-->");
    const text = lines
      .slice(i + 1)
      .join(" ")
      .trim();
    if (a && b && text) cues.push({ start: toSec(a), end: toSec(b.trim().split(" ")[0]!), text });
  }
  return cues;
}
