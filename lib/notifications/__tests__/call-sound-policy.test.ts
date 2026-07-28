import { describe, expect, it, beforeEach } from "vitest";
import {
  callToneEventKeyFor,
  resolveCallSoundPolicy,
  resolveCallToneSoundPolicy,
  resolveIosCustomSoundName,
  serializeCallSoundPolicyForNative,
} from "@/lib/notifications/call-sound-policy";
import {
  buildRegistrySnapshot,
  setNotificationSoundSsotSnapshot,
  invalidateNotificationSoundSsotCache,
} from "@/lib/notifications/notification-sound-resolver";

describe("call-sound-policy", () => {
  beforeEach(() => {
    invalidateNotificationSoundSsotCache();
    setNotificationSoundSsotSnapshot(null);
  });

  it("separates voice/video incoming/outgoing event keys", () => {
    expect(callToneEventKeyFor("voice", "incoming")).toBe("call_incoming_voice");
    expect(callToneEventKeyFor("video", "incoming")).toBe("call_incoming_video");
    expect(callToneEventKeyFor("voice", "outgoing")).toBe("call_outgoing_voice");
    expect(callToneEventKeyFor("video", "outgoing")).toBe("call_outgoing_video");
  });

  it("does not mix rejected and ended keys", () => {
    const snap = buildRegistrySnapshot();
    expect(snap.events.get("call_rejected")?.event_key).toBe("call_rejected");
    expect(snap.events.get("call_ended")?.event_key).toBe("call_ended");
    expect(snap.events.get("call_rejected")?.event_key).not.toBe(
      snap.events.get("call_ended")?.event_key
    );
  });

  it("enabled=false → silent regardless of URL", () => {
    const snap = buildRegistrySnapshot();
    const mapping = snap.mappings.get("call_incoming_voice")!;
    snap.mappings.set("call_incoming_voice", { ...mapping, enabled: false });
    snap.assets.set("ADMIN-URL", {
      id: "ADMIN-URL",
      label: "x",
      kind: "dibay_custom",
      domain: "call_voice",
      file_path: null,
      file_url: "https://cdn.example/a.mp3",
      ios_sound_name: null,
      android_channel_base: "dibay_calls_incoming",
      legacy_source: null,
      enabled: true,
    });
    snap.mappings.set("call_incoming_voice", {
      ...mapping,
      enabled: false,
      asset_id: "ADMIN-URL",
    });
    setNotificationSoundSsotSnapshot(snap);
    const p = resolveCallSoundPolicy("call_incoming_voice");
    expect(p.mode).toBe("silent");
    expect(p.enabled).toBe(false);
    expect(p.webUrl).toBeNull();
    expect(p.androidUrl).toBeNull();
  });

  it("enabled=true + URL → custom", () => {
    const snap = buildRegistrySnapshot();
    const mapping = snap.mappings.get("call_outgoing_voice")!;
    snap.assets.set("ADMIN-RB", {
      id: "ADMIN-RB",
      label: "rb",
      kind: "dibay_custom",
      domain: "call_voice",
      file_path: null,
      file_url: "https://cdn.example/rb.mp3",
      ios_sound_name: null,
      android_channel_base: null,
      legacy_source: null,
      enabled: true,
    });
    snap.mappings.set("call_outgoing_voice", {
      ...mapping,
      enabled: true,
      asset_id: "ADMIN-RB",
    });
    setNotificationSoundSsotSnapshot(snap);
    const p = resolveCallToneSoundPolicy("voice", "outgoing");
    expect(p.mode).toBe("custom");
    expect(p.enabled).toBe(true);
    expect(p.webUrl).toBe("https://cdn.example/rb.mp3");
    expect(p.androidUrl).toBe("https://cdn.example/rb.mp3");
  });

  it("enabled=true + URL missing → default", () => {
    const snap = buildRegistrySnapshot();
    const mapping = snap.mappings.get("call_incoming_video")!;
    const ev = snap.events.get("call_incoming_video")!;
    snap.events.set("call_incoming_video", { ...ev, fallback_event_key: null });
    snap.assets.set("ADMIN-EMPTY", {
      id: "ADMIN-EMPTY",
      label: "empty",
      kind: "dibay_custom",
      domain: "call_video",
      file_path: null,
      file_url: null,
      ios_sound_name: null,
      android_channel_base: "dibay_calls_incoming",
      legacy_source: null,
      enabled: true,
    });
    snap.mappings.set("call_incoming_video", {
      ...mapping,
      enabled: true,
      asset_id: "ADMIN-EMPTY",
    });
    setNotificationSoundSsotSnapshot(snap);
    const p = resolveCallSoundPolicy("call_incoming_video");
    expect(p.mode).toBe("default");
    expect(p.enabled).toBe(true);
    expect(p.webUrl).toBeNull();
  });

  it("ios_sound_name default literal is not custom", () => {
    expect(resolveIosCustomSoundName("default")).toBeNull();
    expect(resolveIosCustomSoundName("dibay_ring.caf")).toBe("dibay_ring.caf");
  });

  it("serialize includes ringtone_policy matching mode", () => {
    const snap = buildRegistrySnapshot();
    setNotificationSoundSsotSnapshot(snap);
    const p = resolveCallSoundPolicy("call_incoming_voice");
    const s = serializeCallSoundPolicyForNative(p);
    expect(s.ringtone_policy).toBe(p.mode);
    expect(s.event_key).toBe(p.eventKey);
  });
});
