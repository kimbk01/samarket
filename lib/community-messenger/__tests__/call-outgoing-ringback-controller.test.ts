import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-tone-web-audio", () => ({
  primeWebAudioCallToneContextFromUserGesture: vi.fn(),
  startWebAudioCallTone: vi.fn(() => null),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  startCommunityMessengerCallTone: vi.fn(async () => ({ stop: vi.fn() })),
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
}));

import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import {
  getOutgoingRingbackSnapshot,
  resetOutgoingRingbackControllerForTests,
  startOutgoingRingback,
  stopAllOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";

describe("call-outgoing-ringback-controller", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.clearAllMocks();
    resetOutgoingRingbackControllerForTests();
  });

  it("starts outgoing ringback once per callId", async () => {
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    await vi.waitFor(() => {
      expect(startCommunityMessengerCallTone).toHaveBeenCalledTimes(1);
    });
    expect(getOutgoingRingbackSnapshot().callId).toBe("session-a");
    expect(getOutgoingRingbackSnapshot().playing).toBe(true);
  });

  it("does not start ringback for empty callId", () => {
    startOutgoingRingback({ callId: "  ", kind: "voice", source: "test" });
    expect(startCommunityMessengerCallTone).not.toHaveBeenCalled();
  });

  it("stops previous callId when a new callId starts", async () => {
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    await vi.waitFor(() => {
      expect(getOutgoingRingbackSnapshot().callId).toBe("session-a");
    });
    startOutgoingRingback({ callId: "session-b", kind: "video", source: "test" });
    await vi.waitFor(() => {
      expect(getOutgoingRingbackSnapshot().callId).toBe("session-b");
    });
    expect(startCommunityMessengerCallTone).toHaveBeenCalledTimes(2);
  });

  it("stops ringback on joined/active/terminal reasons", async () => {
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    await vi.waitFor(() => {
      expect(getOutgoingRingbackSnapshot().playing).toBe(true);
    });
    stopOutgoingRingback("session-a", "local_joined");
    expect(getOutgoingRingbackSnapshot().playing).toBe(false);
    stopOutgoingRingback("session-a", "remote_published");
    stopOutgoingRingback("session-a", "session_active");
    stopOutgoingRingback("session-a", "terminal_status");
    expect(getOutgoingRingbackSnapshot().callId).toBeNull();
  });

  it("stopAllOutgoingRingback clears snapshot", async () => {
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    await vi.waitFor(() => {
      expect(getOutgoingRingbackSnapshot().playing).toBe(true);
    });
    stopAllOutgoingRingback("cleanup");
    expect(getOutgoingRingbackSnapshot().playing).toBe(false);
  });

  it("ignores stop for a different callId while another is active", async () => {
    startOutgoingRingback({ callId: "session-a", kind: "voice", source: "test" });
    await vi.waitFor(() => {
      expect(getOutgoingRingbackSnapshot().playing).toBe(true);
    });
    stopOutgoingRingback("session-b", "wrong_id");
    expect(getOutgoingRingbackSnapshot().callId).toBe("session-a");
  });
});
