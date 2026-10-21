/**
 * Provider abstraction layer.
 *
 * Every external generation capability is defined as an interface here so a new
 * image / video / voice / transcription vendor can be registered without
 * touching application code. Implementations live in src/lib/providers/* and are
 * only ever constructed on the server.
 */

export type ProviderStatus = "connected" | "not_connected" | "coming_soon";

export type ProviderDescriptor = {
  id: string;
  name: string;
  kind: "image" | "video" | "voice" | "transcription";
  status: ProviderStatus;
  /** Human-readable note shown in the UI when the provider is unavailable. */
  note: string;
};

export type GenerateImageInput = {
  prompt: string;
  aspectRatio: string;
  referenceImageUrls?: string[];
  styleHint?: string;
};

export type GenerateVideoInput = {
  prompt: string;
  aspectRatio: string;
  durationSeconds: number;
  startingFrameUrl?: string;
};

export type SynthesizeVoiceInput = {
  text: string;
  voiceId: string;
  language: string;
  speed?: number;
};

export type TranscribeInput = {
  audioUrl: string;
  language?: string;
};

export type AssetResult = { url: string; providerId: string; costCredits: number };

export type TranscriptResult = {
  text: string;
  words: { word: string; startMs: number; endMs: number }[];
  providerId: string;
  costCredits: number;
};

export interface ImageProvider {
  readonly descriptor: ProviderDescriptor;
  generateImage(input: GenerateImageInput): Promise<AssetResult>;
}

export interface VideoProvider {
  readonly descriptor: ProviderDescriptor;
  generateVideo(input: GenerateVideoInput): Promise<AssetResult>;
}

export interface VoiceProvider {
  readonly descriptor: ProviderDescriptor;
  listVoices(): Promise<{ id: string; name: string; language: string; previewUrl?: string }[]>;
  synthesize(input: SynthesizeVoiceInput): Promise<AssetResult>;
}

export interface TranscriptionProvider {
  readonly descriptor: ProviderDescriptor;
  transcribe(input: TranscribeInput): Promise<TranscriptResult>;
}

export class ProviderNotConnectedError extends Error {
  constructor(descriptor: ProviderDescriptor) {
    super(`${descriptor.name} is not connected for this workspace.`);
    this.name = "ProviderNotConnectedError";
  }
}

/** Registry of providers the platform knows about and their current state. */
export const PROVIDER_REGISTRY: ProviderDescriptor[] = [
  {
    id: "lovable-ai-image",
    name: "Createtor Image Engine",
    kind: "image",
    status: "connected",
    note: "Scene image generation from storyboard prompts. Images are saved to your Media Library.",
  },
  {
    id: "lovable-ai-video",
    name: "Createtor Video Engine",
    kind: "video",
    status: "not_connected",
    note: "Optional scene clips. Add a video provider key to enable. Meanwhile you can assemble scene images, voiceover and music into a final video in Video Studio — rendering runs free in your browser.",
  },
  {
    id: "voice-engine",
    name: "Createtor Voice Engine",
    kind: "voice",
    status: "connected",
    note: "Voiceovers in 8 built-in voices with automatic captions, saved to your Media Library.",
  },
  {
    id: "transcription-engine",
    name: "Transcription Engine",
    kind: "transcription",
    status: "not_connected",
    note: "Word-level timing used for synchronized captions and repurposing.",
  },
];
