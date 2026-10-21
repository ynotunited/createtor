import { afterEach, describe, expect, it, vi } from "vitest";

import { pickMimeType } from "@/components/studio/renderer";

describe("pickMimeType", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to video/webm when MediaRecorder is unavailable", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickMimeType()).toBe("video/webm");
  });

  it("prefers VP9 WebM when supported (Chrome)", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (m: string) => m.includes("vp9"),
    });
    expect(pickMimeType()).toBe("video/webm;codecs=vp9,opus");
  });

  it("uses WebM without codecs when only the container is supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (m: string) => m === "video/webm",
    });
    expect(pickMimeType()).toBe("video/webm");
  });

  it("falls through to MP4 when WebM is unsupported (Safari)", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (m: string) => m.startsWith("video/mp4"),
    });
    expect(pickMimeType()).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  });
});
