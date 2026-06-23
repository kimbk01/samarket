import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

let createCount = 0;

const apiMocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => undefined),
  resolveRoom: vi.fn(async ({ roomId }: { roomId?: string | null }) => ({
    ok: true as const,
    roomId: roomId?.trim() || "room-1",
  })),
  createSession: vi.fn(async ({ roomId }: { roomId: string }) => {
    createCount += 1;
    const id = createCount === 1 ? "call-first" : createCount === 2 ? "call-second-room" : "call-third";
    return {
      ok: true,
      session: {
        id,
        roomId,
        sessionMode: "direct",
        initiatorUserId: "user-a",
        recipientUserId: "user-b",
        peerUserId: "user-b",
        peerLabel: "Peer",
        callKind: "voice",
        status: "ringing",
        startedAt: new Date().toISOString(),
        answeredAt: null,
        endedAt: null,
        isMineInitiator: true,
        participants: [],
      } as CommunityMessengerCallSession,
    };
  }),
  patchCancel: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3ReconcileBeforeCreate: apiMocks.reconcile,
  callV3ResolveOutgoingRoomId: apiMocks.resolveRoom,
  callV3CreateSession: apiMocks.createSession,
  callV3PatchCancel: apiMocks.patchCancel,
  callV3MediaTypeFromKind: () => "audio",
}));

vi.mock("@/lib/auth/assert-phone-verified-for-messenger-action-client", () => ({
  assertPhoneVerifiedForMessengerActionOrOpenSheet: () => true,
  resolveMessengerActionReturnPath: () => "/community-messenger",
}));

vi.mock("@/lib/community-messenger/call-phase0-basics", () => ({
  isCmCallVideoEnabled: () => true,
}));

import { callV3Cancel, callV3CreateOutgoing, callV3HandleRemoteTerminal } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3MissedTimersForTests } from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { resetCallV3IncomingDismissedForTests } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-sequential-call", () => {
  beforeEach(() => {
    createCount = 0;
    resetCallV3MissedTimersForTests();
    resetCallV3PatchClaimsForTests();
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.createSession.mockClear();
    apiMocks.patchCancel.mockClear();
  });

  afterEach(() => {
    resetCallV3MissedTimersForTests();
  });

  it("allows same room redial after cancel cleanup", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    await callV3Cancel("call-first", router);

    const second = await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(second.ok).toBe(true);
    expect(apiMocks.createSession).toHaveBeenCalledTimes(2);
    expect(useCallV3Store.getState().identity?.callId).toBe("call-second-room");
    expect(useCallV3Store.getState().canStartNewCall).toBe(false);
  });

  it("allows different room create after cancel cleanup", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    await callV3Cancel("call-first", router);

    const second = await callV3CreateOutgoing({ roomId: "room-2", mediaType: "audio", router });
    expect(second.ok).toBe(true);
    expect(useCallV3Store.getState().identity?.callId).toBe("call-second-room");
  });

  it("does not block new outgoing when previous callId was cancelled", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(useCallV3Store.getState().identity?.callId).toBe("call-first");
    await callV3Cancel("call-first", router);
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);

    const next = await callV3CreateOutgoing({ roomId: "room-9", mediaType: "audio", router });
    expect(next.ok).toBe(true);
    expect(useCallV3Store.getState().identity?.callId).toBe("call-second-room");
  });

  it("allows same room redial after remote rejected cleanup", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    await callV3HandleRemoteTerminal("call-first", "rejected", router);

    expect(useCallV3Store.getState().canStartNewCall).toBe(true);

    const second = await callV3CreateOutgoing({ roomId: "room-1", mediaType: "audio", router });
    expect(second.ok).toBe(true);
    expect(apiMocks.createSession).toHaveBeenCalledTimes(2);
    expect(useCallV3Store.getState().identity?.callId).toBe("call-second-room");
  });
});
