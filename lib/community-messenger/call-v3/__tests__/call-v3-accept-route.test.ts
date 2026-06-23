import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  accept: vi.fn(async () => ({ ok: true })),
  fetchSession: vi.fn(async (): Promise<CommunityMessengerCallSession | null> => null),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchAccept: apiMocks.accept,
  callV3FetchSession: apiMocks.fetchSession,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(async () => true),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
}));

import { callV3Accept } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

describe("call-v3-accept-route", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.accept.mockClear();
    apiMocks.fetchSession.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("accepts once and routes to primary calls screen", async () => {
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

    const push = vi.fn();
    await callV3Accept("call-1", { push });
    await callV3Accept("call-1", { push });

    expect(apiMocks.accept).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/community-messenger/calls/call-1");
    expect(useCallV3Store.getState().phase).toBe("connected");
  });

  it("routes immediately before accept patch when identity was suppressed on lock", async () => {
    apiMocks.fetchSession.mockResolvedValueOnce({
      id: "call-lock",
      roomId: "room-1",
      sessionMode: "direct",
      initiatorUserId: "caller",
      recipientUserId: "callee",
      peerUserId: "caller",
      peerLabel: "Caller",
      callKind: "voice",
      status: "ringing",
      startedAt: "2026-06-23T00:00:00.000Z",
      answeredAt: null,
      endedAt: null,
      isMineInitiator: false,
      participants: [],
    } satisfies CommunityMessengerCallSession);

    let resolveAccept!: (value: { ok: boolean }) => void;
    const acceptDeferred = new Promise<{ ok: boolean }>((resolve) => {
      resolveAccept = resolve;
    });
    apiMocks.accept.mockReturnValueOnce(acceptDeferred);

    const push = vi.fn();
    const acceptPromise = callV3Accept("call-lock", { push });

    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/community-messenger/calls/call-lock");
    });
    expect(useCallV3Store.getState().phase).toBe("accepting");
    expect(apiMocks.accept).toHaveBeenCalledTimes(1);

    resolveAccept({ ok: true });
    await acceptPromise;

    expect(apiMocks.fetchSession).toHaveBeenCalledWith("call-lock");
    expect(useCallV3Store.getState().phase).toBe("connected");
  });
});
