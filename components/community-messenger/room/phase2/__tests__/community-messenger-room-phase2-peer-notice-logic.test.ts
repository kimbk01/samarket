import { describe, expect, it } from "vitest";
import {
  resolveDirectChatInboundRecipient,
  resolvePeerNoticeBranch,
  shouldHidePeerAddContactForInitiator,
} from "@/components/community-messenger/room/phase2/community-messenger-room-phase2-peer-notice-logic";
import { isGeneralFriendDirectRoom } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const TEST_GENERAL_PAIR_KEY =
  "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

const VIEWER = "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PEER = "cccccccc-dddd-dddd-dddd-dddddddddddd";

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
    ownerUserId: partial.ownerUserId ?? null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    peerUserId: partial.peerUserId ?? PEER,
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("resolveDirectChatInboundRecipient", () => {
  it("returns true when peer sent first chat message", () => {
    expect(
      resolveDirectChatInboundRecipient({
        viewerUserId: VIEWER,
        peerUserId: PEER,
        roomOwnerUserId: VIEWER,
        messages: [{ senderId: PEER, messageType: "text", createdAt: "2026-01-01T00:00:01.000Z" }],
      })
    ).toBe(true);
  });

  it("returns false when viewer sent first message (initiator)", () => {
    expect(
      resolveDirectChatInboundRecipient({
        viewerUserId: VIEWER,
        peerUserId: PEER,
        messages: [{ senderId: VIEWER, messageType: "text", createdAt: "2026-01-01T00:00:01.000Z" }],
      })
    ).toBe(false);
  });

  it("returns false for empty room before any message (PN-04)", () => {
    expect(
      resolveDirectChatInboundRecipient({
        viewerUserId: VIEWER,
        peerUserId: PEER,
        roomOwnerUserId: PEER,
        messages: [],
      })
    ).toBe(false);
  });
});

describe("resolvePeerNoticeBranch — P2 A/B", () => {
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
        peerUserId: PEER,
        blockedByMe: false,
        blockedByPeer: false,
        peerRelationLabel: "stranger",
        isInboundRecipient: true,
      })
    ).toBe("none");
  });

  it("PN-02: recipient stranger → add_contact", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: PEER,
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "none",
        peerRelationLabel: "stranger",
        isInboundRecipient: true,
      })
    ).toBe("add_contact");
  });

  it("PN-01: initiator stranger → add_contact (Telegram Contact)", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: PEER,
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "none",
        peerRelationLabel: "stranger",
        isInboundRecipient: false,
      })
    ).toBe("add_contact");
  });

  it("PN-10: legacy pending direction ignored — recipient still add_contact", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: PEER,
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "pending",
        peerRelationLabel: "stranger",
        isInboundRecipient: true,
      })
    ).toBe("add_contact");
  });

  it("returns none for mutual contact", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: PEER,
        blockedByMe: false,
        blockedByPeer: false,
        peerFriendshipState: "accepted",
        peerRelationLabel: "mutual_friend",
        isInboundRecipient: true,
      })
    ).toBe("none");
  });

  it("returns blocked when blockedByMe", () => {
    expect(
      resolvePeerNoticeBranch({
        isGeneralFriendDirect: true,
        roomType: "direct",
        peerUserId: PEER,
        blockedByMe: true,
        blockedByPeer: false,
        peerRelationLabel: "stranger",
        isInboundRecipient: true,
      })
    ).toBe("blocked");
  });
});

describe("shouldHidePeerAddContactForInitiator", () => {
  it("does not hide add for initiator on general direct (Telegram Contact)", () => {
    expect(
      shouldHidePeerAddContactForInitiator({
        isGeneralFriendDirect: true,
        isInboundRecipient: false,
        isContactSaved: false,
      })
    ).toBe(false);
  });

  it("shows add for recipient", () => {
    expect(
      shouldHidePeerAddContactForInitiator({
        isGeneralFriendDirect: true,
        isInboundRecipient: true,
        isContactSaved: false,
      })
    ).toBe(false);
  });

  it("hides when already contact", () => {
    expect(
      shouldHidePeerAddContactForInitiator({
        isGeneralFriendDirect: true,
        isInboundRecipient: false,
        isContactSaved: true,
      })
    ).toBe(false);
  });
});
