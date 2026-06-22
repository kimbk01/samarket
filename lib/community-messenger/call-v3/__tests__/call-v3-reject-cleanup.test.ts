import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  reject: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchReject: apiMocks.reject,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallSessionTerminalBusEvent: vi.fn(),
}));

import { callV3IncomingDiscovered, callV3Reject } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { isCallV3IncomingDismissed } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "a",
    recipientUserId: "b",
    peerUserId: "a",
    peerLabel: "A",
    callKind: "voice",
    status: "ringing",
    startedAt: "2026-06-23T00:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("call-v3-reject-cleanup", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.reject.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("rejects once and returns idle", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canReceiveNewCall: false,
    });

    await callV3Reject("call-1");
    await callV3Reject("call-1");

    expect(apiMocks.reject).toHaveBeenCalledTimes(1);
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
  });

  it("marks dismissed before patch so discovery cannot resurrect banner", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
    });

    let resolveReject: (value: { ok: boolean }) => void = () => {};
    apiMocks.reject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReject = resolve;
        })
    );

    const rejectPromise = callV3Reject("call-1");
    await Promise.resolve();

    expect(useCallV3Store.getState().phase).toBe("ending");
    expect(isCallV3IncomingDismissed("call-1")).toBe(true);

    callV3IncomingDiscovered(ringingSession("call-1"));
    expect(useCallV3Store.getState().phase).toBe("ending");

    resolveReject({ ok: true });
    await rejectPromise;
  });
});
