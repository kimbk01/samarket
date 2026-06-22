import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/call-tone-web-audio", () => ({
  startWebAudioCallTone: vi.fn(() => null),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  startCommunityMessengerCallTone: vi.fn(async () => ({ stop: vi.fn() })),
  stopCommunityMessengerCallTone: vi.fn(),
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
  resolveCapacitorShellPlatform: vi.fn(() => null),
}));

vi.mock("@/lib/push/native/dibay-call-consumed-native-bridge", () => ({
  startNativeIncomingRingtoneFireAndForget: vi.fn(),
  stopNativeIncomingRingtoneFireAndForget: vi.fn(),
}));

import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { startNativeIncomingRingtoneFireAndForget, stopNativeIncomingRingtoneFireAndForget } from "@/lib/push/native/dibay-call-consumed-native-bridge";
import {
  resetIncomingCallRingOwner,
  syncIncomingCallRing,
} from "@/lib/community-messenger/incoming-call/ring-owner";

describe("incoming-call ring-owner", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.clearAllMocks();
    resetIncomingCallRingOwner();
  });

  it("does not restart ring for the same callId (sync dedupe)", async () => {
    const hard = new Map<string, number>();
    syncIncomingCallRing({ sessionId: "c-1", callKind: "voice", hardClearedAt: hard, source: "test" });
    syncIncomingCallRing({ sessionId: "c-1", callKind: "voice", hardClearedAt: hard, source: "test" });
    await vi.waitFor(() => {
      expect(startCommunityMessengerCallTone).toHaveBeenCalledTimes(1);
    });
  });

  it("clears ring on sync(null)", async () => {
    const hard = new Map<string, number>();
    syncIncomingCallRing({ sessionId: "c-2", callKind: "voice", hardClearedAt: hard });
    syncIncomingCallRing(null);
    await vi.waitFor(() => {
      expect(startCommunityMessengerCallTone).toHaveBeenCalledTimes(1);
    });
  });

  it("stops native ring on tombstone when Android (even if activeRingCallId cleared)", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    const hard = new Map<string, number>([["c-tomb", Date.now()]]);
    syncIncomingCallRing({ sessionId: "c-tomb", callKind: "voice", hardClearedAt: hard, source: "test" });
    expect(stopNativeIncomingRingtoneFireAndForget).toHaveBeenCalledWith("c-tomb");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
  });

  it("Android Capacitor sync(null) without tracked callId does not blind-stop native ring", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    syncIncomingCallRing(null);
    expect(stopNativeIncomingRingtoneFireAndForget).not.toHaveBeenCalled();
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
  });

  it("Android Capacitor sync(null) after sync still stops native for tracked callId", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    const hard = new Map<string, number>();
    syncIncomingCallRing({ sessionId: "c-android-clear", callKind: "voice", hardClearedAt: hard, source: "test" });
    vi.clearAllMocks();
    syncIncomingCallRing(null);
    expect(stopNativeIncomingRingtoneFireAndForget).toHaveBeenCalledWith("c-android-clear");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
  });

  it("Android Capacitor ring owner starts native ring (no WebAudio)", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    const hard = new Map<string, number>();
    syncIncomingCallRing({ sessionId: "c-android", callKind: "voice", hardClearedAt: hard, source: "test" });
    expect(startCommunityMessengerCallTone).not.toHaveBeenCalled();
    expect(startNativeIncomingRingtoneFireAndForget).toHaveBeenCalledWith("c-android");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
  });

  it("Browser ring owner does not invoke native ring stop on start", async () => {
    const hard = new Map<string, number>();
    syncIncomingCallRing({ sessionId: "c-browser", callKind: "voice", hardClearedAt: hard, source: "test" });
    await vi.waitFor(() => {
      expect(startCommunityMessengerCallTone).toHaveBeenCalled();
    });
    expect(stopNativeIncomingRingtoneFireAndForget).not.toHaveBeenCalled();
  });
});
