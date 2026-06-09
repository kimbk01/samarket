import { describe, expect, it } from "vitest";
import {
  buildGeneralDirectRoomByPeerMap,
  isGeneralFriendDirectRoom,
  pickGeneralDirectRoomForPeer,
  resolveMessengerDotMenuCallKind,
  resolveMessengerDotMenuCallVisibility,
} from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

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

describe("isGeneralFriendDirectRoom", () => {
  it("accepts sorted-pair friend direct room", () => {
    expect(
      isGeneralFriendDirectRoom(
        roomSummary({
          messengerDirectKey: "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd",
        })
      )
    ).toBe(true);
  });

  it("rejects trade room by direct_key", () => {
    expect(
      isGeneralFriendDirectRoom(roomSummary({ messengerDirectKey: "trade_item:ledger-1" }))
    ).toBe(false);
  });

  it("rejects trade room by contextMeta.kind", () => {
    expect(
      isGeneralFriendDirectRoom(
        roomSummary({ contextMeta: { v: 1, kind: "trade", postId: "p1" } })
      )
    ).toBe(false);
  });

  it("rejects delivery room by store_order direct_key", () => {
    expect(
      isGeneralFriendDirectRoom(roomSummary({ messengerDirectKey: "store_order:order-1" }))
    ).toBe(false);
  });

  it("rejects delivery room by contextMeta.kind", () => {
    expect(
      isGeneralFriendDirectRoom(
        roomSummary({ contextMeta: { v: 1, kind: "delivery", storeOrderId: "o1" } })
      )
    ).toBe(false);
  });

  it("rejects group room", () => {
    expect(isGeneralFriendDirectRoom(roomSummary({ roomType: "private_group" }))).toBe(false);
  });
});

describe("pickGeneralDirectRoomForPeer", () => {
  const peer = "peer-b";

  it("returns general room when trade room is newer for same peer", () => {
    const general = roomSummary({
      id: "general-room",
      peerUserId: peer,
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      messengerDirectKey: "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd",
    });
    const trade = roomSummary({
      id: "trade-room",
      peerUserId: peer,
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      messengerDirectKey: "trade_item:ledger-1",
      contextMeta: { v: 1, kind: "trade", postId: "p1" },
    });
    expect(pickGeneralDirectRoomForPeer([trade, general], peer)?.id).toBe("general-room");
  });

  it("returns null when only trade/delivery rooms exist", () => {
    const trade = roomSummary({
      peerUserId: peer,
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    expect(pickGeneralDirectRoomForPeer([trade], peer)).toBeNull();
  });
});

describe("buildGeneralDirectRoomByPeerMap", () => {
  it("excludes trade rooms from peer map", () => {
    const peer = "peer-b";
    const general = roomSummary({ id: "g1", peerUserId: peer });
    const trade = roomSummary({
      id: "t1",
      peerUserId: peer,
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      messengerDirectKey: "trade_item:x",
      contextMeta: { v: 1, kind: "trade" },
    });
    const map = buildGeneralDirectRoomByPeerMap([trade, general]);
    expect(map.size).toBe(1);
    expect(map.get(peer)?.id).toBe("g1");
  });
});

describe("resolveMessengerDotMenuCallKind", () => {
  it("classifies delivery before trade", () => {
    expect(
      resolveMessengerDotMenuCallKind(
        roomSummary({ messengerDirectKey: "store_order:o1", contextMeta: { v: 1, kind: "delivery", storeOrderId: "o1" } })
      )
    ).toBe("delivery");
  });

  it("classifies trade by direct_key without productChatId meta", () => {
    expect(resolveMessengerDotMenuCallKind(roomSummary({ messengerDirectKey: "trade_item:ledger-1" }))).toBe(
      "trade"
    );
  });

  it("defaults to general for friend pair key", () => {
    expect(
      resolveMessengerDotMenuCallKind(
        roomSummary({ messengerDirectKey: "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd" })
      )
    ).toBe("general");
  });
});

describe("resolveMessengerDotMenuCallVisibility", () => {
  it("general allows voice and video", () => {
    expect(resolveMessengerDotMenuCallVisibility({ callKind: "general" })).toEqual({
      showVoice: true,
      showVideo: true,
    });
  });

  it("delivery hides voice and video in dot menu", () => {
    expect(resolveMessengerDotMenuCallVisibility({ callKind: "delivery" })).toEqual({
      showVoice: false,
      showVideo: false,
    });
  });

  it("trade follows allow_call and video flag", () => {
    expect(
      resolveMessengerDotMenuCallVisibility({
        callKind: "trade",
        tradeAllowCall: true,
        tradeVideoCallEnabled: false,
      })
    ).toEqual({ showVoice: true, showVideo: false });
    expect(
      resolveMessengerDotMenuCallVisibility({
        callKind: "trade",
        tradeAllowCall: false,
        tradeVideoCallEnabled: true,
      })
    ).toEqual({ showVoice: false, showVideo: false });
  });
});
