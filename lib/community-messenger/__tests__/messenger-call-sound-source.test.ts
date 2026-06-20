import { describe, expect, it } from "vitest";
import { createDefaultMessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";
import { resolveMessengerCallTonePlayback } from "@/lib/community-messenger/messenger-call-sound-source";

describe("messenger-call-sound-source", () => {
  it("returns device_ringtone when source is device_ringtone", () => {
    const cfg = createDefaultMessengerCallSoundConfig();
    cfg.voice_incoming_sound_source = "device_ringtone";
    expect(resolveMessengerCallTonePlayback(cfg, "incoming", "voice")).toEqual({ kind: "device_ringtone" });
  });

  it("returns admin_url when source is admin_custom and URL exists", () => {
    const cfg = createDefaultMessengerCallSoundConfig();
    cfg.voice_outgoing_ringback_source = "admin_custom";
    cfg.voice_outgoing_ringback_url = "https://example.com/out.mp3";
    expect(resolveMessengerCallTonePlayback(cfg, "outgoing", "voice")).toEqual({
      kind: "admin_url",
      url: "https://example.com/out.mp3",
    });
  });

  it("falls back to device_ringtone when admin_custom without URL", () => {
    const cfg = createDefaultMessengerCallSoundConfig();
    cfg.video_incoming_sound_source = "admin_custom";
    cfg.video_incoming_sound_url = null;
    expect(resolveMessengerCallTonePlayback(cfg, "incoming", "video")).toEqual({ kind: "device_ringtone" });
  });

  it("returns disabled when tone is turned off", () => {
    const cfg = createDefaultMessengerCallSoundConfig();
    cfg.video_outgoing_ringback_enabled = false;
    expect(resolveMessengerCallTonePlayback(cfg, "outgoing", "video")).toEqual({ kind: "disabled" });
  });
});
