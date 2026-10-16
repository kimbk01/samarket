import { afterEach, describe, expect, it } from "vitest";
import { readOwnLiveCall } from "@/lib/call/own-live-call";
import { acquireCallActionLock, resetCallActionLockForTests } from "@/lib/call/call-action-lock";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

afterEach(() => {
  useCallV4Store.getState().resetToIdle();
  resetCallActionLockForTests();
});

describe("readOwnLiveCall — one outgoing call at a time", () => {
  it("idle → no live call", () => {
    expect(readOwnLiveCall()).toBeNull();
  });

  it("V4/native lane ringing is seen (previous global guard missed it)", () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "me",
        calleeUserId: "peer",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });
    expect(readOwnLiveCall()).toEqual({ callId: "call-1", source: "v4" });
  });

  it("V4 creating (no server id yet) still blocks", () => {
    useCallV4Store.setState({ phase: "creating", canStartNewCall: false, identity: null });
    expect(readOwnLiveCall()).toEqual({ callId: null, source: "v4" });
  });

  it("V4 terminal phase with start allowed → not live", () => {
    useCallV4Store.setState({ phase: "ended", canStartNewCall: true, identity: null });
    expect(readOwnLiveCall()).toBeNull();
  });

  it("web lane start lock is seen", () => {
    const r = acquireCallActionLock({ roomId: "room-2", mediaType: "voice" });
    expect(r.ok).toBe(true);
    expect(readOwnLiveCall()?.source).toBe("lock");
  });
});
