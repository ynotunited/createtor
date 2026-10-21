/** Shared option lists used across the generator forms. */
export const LANGUAGES = [
  "English",
  "Spanish",
  "German",
  "French",
  "Portuguese",
  "Hindi",
  "Arabic",
] as const;

export type Language = (typeof LANGUAGES)[number];

export const TONES = [
  "educational",
  "emotional",
  "storytelling",
  "energetic",
  "calm",
  "authoritative",
] as const;
