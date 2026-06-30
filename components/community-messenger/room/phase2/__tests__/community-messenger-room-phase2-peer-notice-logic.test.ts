import { describe, expect, it } from "vitest";
import {
  isPendingIncomingFriendRequest,
  isPendingOutgoingFriendRequest,
  resolvePeerNoticeBranch,
} from "@/components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic";
import { isGeneralFriendDirectRoom } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const TEST_GENERAL_PAIR_KEY =
  "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

function roomSummary(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "r1",
    roomType: partial.roomType ?? "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    peerUserId: partial.peerUserId ?? "peer-b",
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("isPendingOutgoingFriendRequest / isPendingIncomingFriendRequest", () => {
  it("treats outgoing_pending as outgoing", () => {
    expect(isPendingOutgoingFriendRequest({ friendshipDirection: "outgoing_pending" })).toBe(true);
    expect(isPendingIncomingFriendRequest({ friendshipDirection: "outgoing_pending" })).toBe(false);
  });

  it("treats incoming_pending as incoming", () => {
    expect(isPendingIncomingFriendRequest({ friendshipDirection: "incoming_pending" })).toBe(true);
    expect(isPendingOutgoingFriendRequest({ friendshipDirection: "incoming_pending" })).toBe(false);
  });
});

describe("resolvePeerNoticeBranch", () => {
  it("returns none for trade_pc direct rooms", () => {
    const tradeRoom = roomSummary({
      messengerDirectKey: "trade_pc:abc:peer-b",
      contextMeta: { v: 1, kind: "trade" },
    });
    expect(isGeneralFriendDirectRoom(tradeRoom)).toBe(false);
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: false,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        friendshipDirection: "incoming_pending",
        peerRelationLabel: "stranger",
      })
    ).toBe("none");
  });

  it("returns pending_incoming on general pair even with legacy trade contextMeta", () => {
    const generalWithLegacyTradeMeta = roomSummary({
      messengerDirectKey: TEST_GENERAL_PAIR_KEY,
      contextMeta: { v: 1, kind: "trade", headline: "legacy" },
    });
    expect(isGeneralFriendDirectRoom(generalWithLegacyTradeMeta)).toBe(true);
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        friendshipDirection: "incoming_pending",
        peerRelationLabel: "stranger",
      })
    ).toBe("pending_incoming");
  });

  it("hides stranger bar for pending outgoing requester", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        friendshipDirection: "outgoing_pending",
        peerRelationLabel: "saved_by_me",
      })
    ).toBe("pending_outgoing_hidden");
  });

  it("returns pending_incoming before stranger for addressee", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        friendshipDirection: "incoming_pending",
        peerRelationLabel: "saved_by_peer",
      })
    ).toBe("pending_incoming");
  });

  it("returns none for mutual_accepted", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "accepted",
        friendshipDirection: "mutual_accepted",
        peerRelationLabel: "mutual_friend",
      })
    ).toBe("none");
  });

  it("returns stranger for general direct with no friendship row", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "none",
        friendshipDirection: "none",
        peerRelationLabel: "stranger",
      })
    ).toBe("stranger");
  });

  it("returns none for store_order direct rooms", () => {
    const storeOrderRoom = roomSummary({
      messengerDirectKey: "store_order:order-1:peer-b",
    });
    expect(isGeneralFriendDirectRoom(storeOrderRoom)).toBe(false);
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: false,
        roomType: "direct",
        peerUserId: "peer-b",
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        friendshipDirection: "incoming_pending",
        peerRelationLabel: "stranger",
      })
    ).toBe("none");
  });
});
