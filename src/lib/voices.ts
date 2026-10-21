/** Built-in narration voices available from the voice engine. */
export const BUILTIN_VOICES = [
  { id: "Kore", label: "Kore", description: "Firm, clear female narrator" },
  { id: "Aoede", label: "Aoede", description: "Bright, breezy female voice" },
  { id: "Leda", label: "Leda", description: "Youthful female voice" },
  { id: "Zephyr", label: "Zephyr", description: "Light, bright female voice" },
  { id: "Puck", label: "Puck", description: "Upbeat male voice" },
  { id: "Charon", label: "Charon", description: "Informative, deep male voice" },
  { id: "Fenrir", label: "Fenrir", description: "Excitable male voice" },
  { id: "Orus", label: "Orus", description: "Firm male voice" },
] as const;

export type BuiltinVoiceId = (typeof BUILTIN_VOICES)[number]["id"];
export const VOICE_IDS = BUILTIN_VOICES.map((v) => v.id) as [BuiltinVoiceId, ...BuiltinVoiceId[]];

export const DELIVERY_STYLES = [
  { id: "", label: "Natural" },
  { id: "Say warmly and calmly", label: "Warm & calm" },
  { id: "Say with energy and excitement", label: "Energetic" },
  { id: "Say like a cinematic documentary narrator", label: "Documentary" },
  { id: "Say in a suspenseful, dramatic tone", label: "Dramatic" },
  { id: "Say in a friendly, conversational tone", label: "Conversational" },
];

/** Credits for a voiceover: per started minute of estimated speech (~150 wpm). */
export function voiceoverCost(text: string, perMinute: number) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 150)) * perMinute;
}
