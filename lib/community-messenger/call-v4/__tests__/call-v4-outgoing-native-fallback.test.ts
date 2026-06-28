import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const bridgeMocks = vi.hoisted(() => ({
  isAndroidNativeOutgoingShell: vi.fn(() => false),
  startNativeOutgoingEstablishment: vi.fn(async () => ({ ok: false, nativeOwned: false })),
}));

const apiMocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => undefined),
  resolveRoom: vi.fn(async () => ({ ok: true as const, roomId: "room-1" })),
  createSession: vi.fn(async () => ({
    ok: true,
    session: {
      id: "call-1",
      roomId: "room-1",
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
  })),
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isAndroidNativeOutgoingShell: bridgeMocks.isAndroidNativeOutgoingShell,
  startNativeOutgoingEstablishment: bridgeMocks.startNativeOutgoingEstablishment,
  isNativeEstablishmentOwned: vi.fn(async () => false),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    callV4ReconcileBeforeCreate: apiMocks.reconcile,
    callV4ResolveOutgoingRoomId: apiMocks.resolveRoom,
    callV4CreateSession: apiMocks.createSession,
  };
});

import { callV4CreateOutgoing } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4-outgoing-native-fallback (P2-2)", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    bridgeMocks.isAndroidNativeOutgoingShell.mockReturnValue(false);
    bridgeMocks.startNativeOutgoingEstablishment.mockResolvedValue({ ok: false, nativeOwned: false });
    apiMocks.reconcile.mockClear();
    apiMocks.resolveRoom.mockClear();
    apiMocks.createSession.mockClear();
  });

  it("Android native shell: handoff failure still shows Web outgoing presentation screen", async () => {
    bridgeMocks.isAndroidNativeOutgoingShell.mockReturnValue(true);
    bridgeMocks.startNativeOutgoingEstablishment.mockResolvedValue({ ok: false, nativeOwned: false });

    const replace = vi.fn();
    const push = vi.fn();
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push, replace },
    });

    expect(result.ok).toBe(true);
    expect(replace).toHaveBeenCalledWith("/community-messenger/calls-v4/call-1?source=outgoing");
    expect(useCallV4Store.getState().phase).toBe("outgoing_ringing");
    expect(useCallV4Store.getState().identity?.callId).toBe("call-1");
  });

  it("Android native shell: handoff success keeps Web outgoing presentation screen", async () => {
    bridgeMocks.isAndroidNativeOutgoingShell.mockReturnValue(true);
    bridgeMocks.startNativeOutgoingEstablishment.mockResolvedValue({ ok: true, nativeOwned: true });

    const replace = vi.fn();
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace },
    });

    expect(result.ok).toBe(true);
    expect(replace).toHaveBeenCalledWith("/community-messenger/calls-v4/call-1?source=outgoing");
    expect(useCallV4Store.getState().phase).toBe("outgoing_ringing");
    expect(useCallV4Store.getState().identity?.callId).toBe("call-1");
  });

  it("non-Android: handoff failure still uses legacy Web outgoing route", async () => {
    bridgeMocks.isAndroidNativeOutgoingShell.mockReturnValue(false);
    bridgeMocks.startNativeOutgoingEstablishment.mockResolvedValue({ ok: false, nativeOwned: false });

    const replace = vi.fn();
    const result = await callV4CreateOutgoing({
      roomId: "room-1",
      mediaType: "audio",
      router: { push: vi.fn(), replace },
    });

    expect(result.ok).toBe(true);
    expect(replace).toHaveBeenCalledWith("/community-messenger/calls-v4/call-1?source=outgoing");
    expect(useCallV4Store.getState().phase).toBe("outgoing_ringing");
  });
});
