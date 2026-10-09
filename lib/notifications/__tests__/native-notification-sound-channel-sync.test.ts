/** @vitest-environment jsdom */
/**
 * W4 — Android 이벤트 음원 채널 동기화 JS 계약.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_SOUND_ASSETS,
  NOTIFICATION_SOUND_EVENTS,
} from "@/lib/notifications/notification-sound-registry";
import {
  hydrateNotificationSoundSnapshotFromRows,
  resetNotificationSoundSsotSnapshotForTests,
} from "@/lib/notifications/notification-sound-resolver";

const { syncEventSounds, platform } = vi.hoisted(() => ({
  syncEventSounds: vi.fn(async (_options: unknown): Promise<Record<string, unknown>> => ({ ok: true })),
  platform: { native: true, shell: "android" as "android" | "ios" | null },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ syncEventSounds }),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platform.native,
  resolveCapacitorShellPlatform: () => platform.shell,
}));

import {
  buildNativeEventSoundEntries,
  nativeEventSoundEntriesSignature,
  resetNativeNotificationSoundChannelSyncForTests,
  syncNativeNotificationSoundChannelsBestEffort,
} from "@/lib/notifications/native-notification-sound-channel-sync";

const CALL_CHANNEL = /^(dibay_calls_|dibay_native_voice_|dibay_native_video_|dibay_incoming_calls|dibay_active_call)/;

async function hydrateAllCustom(): Promise<void> {
  const assets = NOTIFICATION_SOUND_ASSETS.map((a) => ({
    ...a,
    kind: "dibay_custom" as const,
    file_url: `https://cdn.example.test/sounds/${a.id}.mp3`,
  }));
  await hydrateNotificationSoundSnapshotFromRows({
    assets,
    events: NOTIFICATION_SOUND_EVENTS.map((e) => ({ ...e })),
    mappings: [],
  });
}

describe("W4 native notification sound channel sync", () => {
  beforeEach(() => {
    resetNotificationSoundSsotSnapshotForTests();
    resetNativeNotificationSoundChannelSyncForTests();
    syncEventSounds.mockClear();
    platform.native = true;
    platform.shell = "android";
  });
  afterEach(() => {
    resetNotificationSoundSsotSnapshotForTests();
  });

  it("never includes call_* events or call channels", async () => {
    await hydrateAllCustom();
    const entries = buildNativeEventSoundEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.eventKey.startsWith("call_")).toBe(false);
      expect(CALL_CHANNEL.test(e.baseChannelId)).toBe(false);
    }
  });

  it("custom https asset → url+assetId; non-https → empty (base channel default sound)", async () => {
    await hydrateAllCustom();
    for (const e of buildNativeEventSoundEntries()) {
      if (e.url) {
        expect(e.url.startsWith("https://")).toBe(true);
        expect(e.assetId).not.toBe("");
      } else {
        expect(e.assetId).toBe("");
      }
    }
  });

  it("signature is deterministic", async () => {
    await hydrateAllCustom();
    const a = nativeEventSoundEntriesSignature(buildNativeEventSoundEntries());
    const b = nativeEventSoundEntriesSignature(buildNativeEventSoundEntries());
    expect(a).toBe(b);
  });

  it("no-op before admin hydrate, on web, and on iOS", async () => {
    await syncNativeNotificationSoundChannelsBestEffort();
    expect(syncEventSounds).not.toHaveBeenCalled();
    await hydrateAllCustom();
    platform.native = false;
    await syncNativeNotificationSoundChannelsBestEffort();
    platform.native = true;
    platform.shell = "ios";
    await syncNativeNotificationSoundChannelsBestEffort();
    expect(syncEventSounds).not.toHaveBeenCalled();
  });

  it("syncs once per unique snapshot (dedupe)", async () => {
    await hydrateAllCustom();
    await syncNativeNotificationSoundChannelsBestEffort();
    await syncNativeNotificationSoundChannelsBestEffort();
    expect(syncEventSounds).toHaveBeenCalledTimes(1);
  });

  it("old APK (UNIMPLEMENTED) → swallowed, stops retrying", async () => {
    await hydrateAllCustom();
    syncEventSounds.mockRejectedValueOnce(Object.assign(new Error("not implemented"), { code: "UNIMPLEMENTED" }));
    await expect(syncNativeNotificationSoundChannelsBestEffort()).resolves.toBeUndefined();
    await syncNativeNotificationSoundChannelsBestEffort();
    expect(syncEventSounds).toHaveBeenCalledTimes(1);
  });

  it("transient failure → retried on next hydrate", async () => {
    await hydrateAllCustom();
    syncEventSounds.mockRejectedValueOnce(new Error("boom"));
    await syncNativeNotificationSoundChannelsBestEffort();
    await syncNativeNotificationSoundChannelsBestEffort();
    expect(syncEventSounds).toHaveBeenCalledTimes(2);
  });
});
