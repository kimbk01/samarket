import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCallV3RingtoneForTests, startCallV3Ringtone, readCallV3ActiveRingtoneCallId, stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";

const toneMocks = vi.hoisted(() => ({
  start: vi.fn(async () => ({ stop: vi.fn() })),
  stopAll: vi.fn(),
  unlock: vi.fn(),
}));

const platformMocks = vi.hoisted(() => ({
  isNative: false,
  shell: "web" as string,
}));

const nativeMocks = vi.hoisted(() => ({
  startNative: vi.fn(),
  stopNative: vi.fn(),
  plugin: { startIncomingRingtone: vi.fn() } as { startIncomingRingtone?: () => Promise<void> } | null,
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  startCommunityMessengerCallTone: toneMocks.start,
  stopCommunityMessengerCallTone: toneMocks.stopAll,
  unlockCommunityMessengerCallPlaybackFromUserGesture: toneMocks.unlock,
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platformMocks.isNative,
  resolveCapacitorShellPlatform: () => platformMocks.shell,
}));

vi.mock("@/lib/push/native/dibay-call-consumed-native-bridge", () => ({
  startNativeIncomingRingtoneFireAndForget: nativeMocks.startNative,
  stopNativeIncomingRingtoneFireAndForget: nativeMocks.stopNative,
}));

vi.mock("@/lib/push/native/push-route-native-bridge", () => ({
  getSyncNativeIncomingCallPlugin: () => nativeMocks.plugin,
}));

vi.mock("@/lib/community-messenger/call-tone-web-audio", () => ({
  getPrimedWebAudioCallToneContextState: () => "running",
}));

describe("call-v3-ringtone", () => {
  beforeEach(() => {
    resetCallV3RingtoneForTests();
    toneMocks.start.mockClear();
    toneMocks.stopAll.mockClear();
    toneMocks.unlock.mockClear();
    nativeMocks.startNative.mockClear();
    nativeMocks.stopNative.mockClear();
    platformMocks.isNative = false;
    platformMocks.shell = "web";
    nativeMocks.plugin = { startIncomingRingtone: vi.fn() };
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("starts web ringtone once per callId", async () => {
    startCallV3Ringtone("call-1", "voice");
    startCallV3Ringtone("call-1", "voice");
    await Promise.resolve();
    expect(toneMocks.start).toHaveBeenCalledTimes(1);
    expect(nativeMocks.startNative).not.toHaveBeenCalled();
    expect(readCallV3ActiveRingtoneCallId()).toBe("call-1");
  });

  it("uses native ring owner on Android APK", () => {
    platformMocks.isNative = true;
    platformMocks.shell = "android";
    startCallV3Ringtone("call-1", "voice");
    expect(nativeMocks.startNative).toHaveBeenCalledWith("call-1");
    expect(toneMocks.start).not.toHaveBeenCalled();
    expect(toneMocks.unlock).not.toHaveBeenCalled();
  });

  it("stops web and native ringtone owners", () => {
    platformMocks.isNative = true;
    platformMocks.shell = "android";
    startCallV3Ringtone("call-1", "voice");
    stopCallV3Ringtone("test");
    expect(nativeMocks.stopNative).toHaveBeenCalledWith("call-1");
    expect(toneMocks.stopAll).toHaveBeenCalled();
    expect(readCallV3ActiveRingtoneCallId()).toBeNull();
  });
});
