import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommunityMessengerFriendshipState } from "@/lib/community-messenger/friendship/types";

const resolveMock = vi.fn<(_: unknown) => Promise<CommunityMessengerFriendshipState>>();

vi.mock("@/lib/community-messenger/friendship/friendship-resolver", () => ({
  resolveCommunityMessengerFriendshipStatus: (input: unknown) => resolveMock(input),
  batchResolveCommunityMessengerFriendshipStatus: vi.fn(),
}));

import {
  assertCanSendDirectMessage,
  assertCanStartDirectCall,
} from "@/lib/community-messenger/friendship/friendship-permission-guards";

function acceptedState(): CommunityMessengerFriendshipState {
  return {
    status: "accepted",
    friendshipStatus: "accepted",
    friendshipId: "fid-1",
    canMessage: true,
    canCall: true,
    canAddFriend: false,
    canUnblock: false,
    isFriend: true,
    isBlockedByMe: false,
    isBlockedByPeer: false,
    readdBlockedUntil: null,
    requestRoomId: null,
    requestMessageId: null,
  };
}

describe("call/message guard uses server resolver (accept 직후 stale cache 방지)", () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it("수락 직후 resolver가 accepted면 5초 이내 통화/메시지 허용", async () => {
    resolveMock.mockResolvedValue(acceptedState());
    const messageGate = await assertCanSendDirectMessage({
      viewerUserId: "viewer-1",
      peerUserId: "peer-1",
    });
    const callGate = await assertCanStartDirectCall({
      viewerUserId: "viewer-1",
      peerUserId: "peer-1",
    });
    expect(messageGate).toEqual({ ok: true });
    expect(callGate).toEqual({ ok: true });
    expect(resolveMock).toHaveBeenCalledTimes(2);
  });

  it("resolver가 pending이면 통화 차단 (클라이언트 캐시 무관)", async () => {
    resolveMock.mockResolvedValue({
      ...acceptedState(),
      status: "request_pending_outgoing",
      friendshipStatus: "pending",
      canMessage: false,
      canCall: false,
      isFriend: false,
    });
    const callGate = await assertCanStartDirectCall({
      viewerUserId: "viewer-1",
      peerUserId: "peer-1",
    });
    expect(callGate).toEqual({ ok: false, error: "friend_required" });
  });
});
