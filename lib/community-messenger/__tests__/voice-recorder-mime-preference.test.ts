import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickCommunityMessengerVoiceRecorderMime,
  pickVoiceRecorderMimeFrom,
} from "@/lib/community-messenger/voice-recording";

describe("voice recorder MIME preference (mp4/AAC first on every platform)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chooses AAC mp4 when supported even if webm/opus is also supported (Chrome Android)", () => {
    const supported = new Set(["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
    expect(pickVoiceRecorderMimeFrom((m) => supported.has(m))).toEqual({
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      fileExtension: "m4a",
    });
  });

  it("falls back to plain audio/mp4 when the codec-qualified type is not supported (iOS Safari)", () => {
    expect(pickVoiceRecorderMimeFrom((m) => m === "audio/mp4")).toEqual({ mimeType: "audio/mp4", fileExtension: "m4a" });
  });

  it("falls back to webm/opus only when mp4 is unsupported", () => {
    const supported = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]);
    expect(pickVoiceRecorderMimeFrom((m) => supported.has(m))).toEqual({
      mimeType: "audio/webm;codecs=opus",
      fileExtension: "webm",
    });
  });

  it("falls back to ogg when only ogg is supported", () => {
    expect(pickVoiceRecorderMimeFrom((m) => m === "audio/ogg")).toEqual({ mimeType: "audio/ogg", fileExtension: "ogg" });
  });

  it("returns recorder default when nothing matches or isTypeSupported throws", () => {
    expect(pickVoiceRecorderMimeFrom(() => false)).toEqual({ mimeType: "", fileExtension: "webm" });
    expect(
      pickVoiceRecorderMimeFrom(() => {
        throw new Error("boom");
      })
    ).toEqual({ mimeType: "", fileExtension: "webm" });
    expect(pickVoiceRecorderMimeFrom(undefined)).toEqual({ mimeType: "", fileExtension: "webm" });
  });

  it("uses global MediaRecorder.isTypeSupported regardless of user agent", () => {
    vi.stubGlobal("MediaRecorder", { isTypeSupported: (m: string) => m === "audio/mp4" || m === "audio/webm" });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/126", platform: "Linux", maxTouchPoints: 5 });
    expect(pickCommunityMessengerVoiceRecorderMime()).toEqual({ mimeType: "audio/mp4", fileExtension: "m4a" });
  });

  it("returns default when MediaRecorder is unavailable", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickCommunityMessengerVoiceRecorderMime()).toEqual({ mimeType: "", fileExtension: "webm" });
  });
});
