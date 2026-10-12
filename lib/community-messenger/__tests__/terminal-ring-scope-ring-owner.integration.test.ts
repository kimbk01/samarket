import { beforeEach, describe, expect, it, vi } from "vitest";

/** 실제 ring-owner + call-engine remote terminal 경로. 오디오·네이티브만 가짜로 둔다. */
const audio = vi.hoisted(() => ({
  playing: null as string | null,
  play: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-ringtone-controller", () => ({
  playIncomingCallRingtone: (sid: string) => {
    audio.playing = sid;
    audio.play(sid);
  },
  /** 실제 컨트롤러와 같은 세션 필터 — 다른 세션 stop 은 무시 (call-ringtone-controller.ts:105) */
  stopCallRingtone: (reason: string, sid?: string | null) => {
    if (sid && audio.playing && audio.playing !== sid) return;
    audio.stop(reason, sid);
    audio.playing = null;
  },
}));
vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
  stopCommunityMessengerCallTone: vi.fn(),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => false,
  resolveCapacitorShellPlatform: () => "web",
}));
vi.mock("@/lib/push/native/dibay-call-consumed-native-bridge", () => ({
  startNativeIncomingRingtoneFireAndForget: vi.fn(),
  stopNativeIncomingRingtoneFireAndForget: vi.fn(),
}));
vi.mock("@/lib/push/native/sync-native-incoming-call-plugin", () => ({
  getSyncNativeIncomingCallPlugin: () => null,
}));
vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
  sealDibayCallTerminalSurface: vi.fn(),
}));

import {
  getActiveIncomingRingCallId,
  resetIncomingCallRingOwner,
  syncIncomingCallRing,
} from "@/lib/community-messenger/incoming-call/ring-owner";
import { stopRemoteIncomingSounds } from "@/lib/community-messenger/call-engine/call-engine-remote-terminal";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

describe("remote terminal ring scope (real ring-owner)", () => {
  beforeEach(() => {
    resetIncomingCallRingOwner();
    audio.playing = null;
    audio.play.mockReset();
    audio.stop.mockReset();
  });

  it("A's late remote terminal keeps B ringing; B's own terminal stops it", () => {
    syncIncomingCallRing({ sessionId: B, callKind: "voice", hardClearedAt: new Map(), source: "test" });
    expect(getActiveIncomingRingCallId()).toBe(B);
    expect(audio.playing).toBe(B);

    stopRemoteIncomingSounds(A, "remote_cancelled");
    expect(getActiveIncomingRingCallId()).toBe(B);
    expect(audio.playing).toBe(B);

    stopRemoteIncomingSounds(B, "remote_cancelled");
    expect(getActiveIncomingRingCallId()).toBeNull();
    expect(audio.playing).toBeNull();
  });
});
