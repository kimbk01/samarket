import { describe, expect, it } from "vitest";
import {
  buildGeneralDirectRoomByPeerMap,
  communityMessengerSummaryEligibleForPhaseDTradeEnrich,
  isGeneralFriendDirectRoom,
  isMessengerCommerceDirectKey,
  isMessengerGeneralFriendDirectKey,
  pickGeneralDirectRoomForPeer,
  resolveMessengerDotMenuCallKind,
  resolveMessengerDotMenuCallVisibility,
  resolveMessengerRoomFeatureGate,
} from "@/lib/community-messenger/messenger-room-domain";
import { buildMessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

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

describe("isMessengerGeneralFriendDirectKey", () => {
  const pairKey =
    "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

  it("accepts sorted user pair keys", () => {
    expect(isMessengerGeneralFriendDirectKey(pairKey)).toBe(true);
  });

  it("rejects commerce direct keys", () => {
    expect(isMessengerGeneralFriendDirectKey("trade_pc:pc-1")).toBe(false);
    expect(isMessengerGeneralFriendDirectKey("trade_item:ledger-1")).toBe(false);
    expect(isMessengerGeneralFriendDirectKey("store_order:order-1")).toBe(false);
    expect(isMessengerGeneralFriendDirectKey("trade_order:order-1")).toBe(false);
  });
});

describe("communityMessengerSummaryEligibleForPhaseDTradeEnrich", () => {
  const peer = "peer-b";
  const pairKey =
    "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

  it("excludes general friend DM even when trade history exists for the peer", () => {
    const general = roomSummary({
      peerUserId: peer,
      messengerDirectKey: pairKey,
    });
    expect(communityMessengerSummaryEligibleForPhaseDTradeEnrich(general)).toBe(false);
  });

  it("still allows non-pair direct rows without commerce key", () => {
    const orphan = roomSummary({
      peerUserId: peer,
      messengerDirectKey: null,
    });
    expect(communityMessengerSummaryEligibleForPhaseDTradeEnrich(orphan)).toBe(true);
  });

  it("excludes confirmed trade and delivery rows", () => {
    expect(
      communityMessengerSummaryEligibleForPhaseDTradeEnrich(
        roomSummary({ messengerDirectKey: "trade_pc:pc-1" })
      )
    ).toBe(false);
    expect(
      communityMessengerSummaryEligibleForPhaseDTradeEnrich(
        roomSummary({
          messengerDirectKey: "store_order:o1",
          contextMeta: { v: 1, kind: "delivery", storeOrderId: "o1" },
        })
      )
    ).toBe(false);
  });
});

describe("friend message routing with trade peer history", () => {
  const peer = "peer-b";
  const pairKey =
    "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

  it("picks general room when trade room is newer for the same peer", () => {
    const general = roomSummary({
      id: "general-room",
      peerUserId: peer,
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      messengerDirectKey: pairKey,
    });
    const trade = roomSummary({
      id: "trade-room",
      peerUserId: peer,
      lastMessageAt: "2026-06-01T00:00:00.000Z",
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    const picked = pickGeneralDirectRoomForPeer([trade, general], peer);
    expect(picked?.id).toBe("general-room");
    expect(isGeneralFriendDirectRoom(picked!)).toBe(true);
    expect(isMessengerCommerceDirectKey(trade.messengerDirectKey)).toBe(true);
  });
});

function bootstrapFixture(
  partial: Partial<CommunityMessengerBootstrap>
): CommunityMessengerBootstrap {
  return {
    me: {
      id: "me-1",
      label: "Me",
      avatarUrl: null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
    },
    tabs: { friends: 0, chats: 0, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats: [],
    groups: [],
    discoverableGroups: [],
    calls: [],
    ...partial,
  };
}

describe("friend list vs chat list separation", () => {
  const peer = "peer-b";
  const pairKey =
    "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";

  it("pending: not in friend list, general chat visible", () => {
    const generalChat = roomSummary({
      id: "general-room",
      peerUserId: peer,
      messengerDirectKey: pairKey,
    });
    const data = bootstrapFixture({
      requests: [
        {
          id: "req-1",
          requesterId: "me-1",
          requesterLabel: "Me",
          addresseeId: peer,
          addresseeLabel: "Peer",
          status: "pending",
          direction: "outgoing",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      chats: [generalChat],
    });
    const model = buildMessengerFriendStateModel(data, buildGeneralDirectRoomByPeerMap(data.chats));
    expect(model.friends).toHaveLength(0);
    expect(isGeneralFriendDirectRoom(generalChat)).toBe(true);
  });

  it("accepted: friend list and general chat both visible", () => {
    const generalChat = roomSummary({
      id: "general-room",
      peerUserId: peer,
      messengerDirectKey: pairKey,
    });
    const data = bootstrapFixture({
      friends: [
        {
          id: peer,
          label: "Peer",
          avatarUrl: null,
          following: false,
          blocked: false,
          isFriend: true,
          isFavoriteFriend: false,
        },
      ],
      chats: [generalChat],
    });
    const model = buildMessengerFriendStateModel(data, buildGeneralDirectRoomByPeerMap(data.chats));
    expect(model.friends).toHaveLength(1);
    expect(model.friends[0]?.profile.id).toBe(peer);
    expect(isGeneralFriendDirectRoom(generalChat)).toBe(true);
  });

  it("blocked: not in friend list and general chat hidden from main inbox helper", () => {
    const hiddenGeneral = roomSummary({
      id: "general-room",
      peerUserId: peer,
      messengerDirectKey: pairKey,
      isBlockedHiddenByViewer: true,
    });
    const data = bootstrapFixture({
      blocked: [
        {
          id: peer,
          label: "Peer",
          avatarUrl: null,
          following: false,
          blocked: true,
          isFriend: false,
          isFavoriteFriend: false,
        },
      ],
      chats: [hiddenGeneral],
    });
    const model = buildMessengerFriendStateModel(data, buildGeneralDirectRoomByPeerMap(data.chats));
    expect(model.friends).toHaveLength(0);
    expect(model.blocked).toHaveLength(1);
  });

  it("trade counterpart without friendship stays out of friend list", () => {
    const tradeChat = roomSummary({
      id: "trade-room",
      peerUserId: peer,
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
    });
    const data = bootstrapFixture({ chats: [tradeChat] });
    const model = buildMessengerFriendStateModel(data, buildGeneralDirectRoomByPeerMap(data.chats));
    expect(model.friends).toHaveLength(0);
    expect(isGeneralFriendDirectRoom(tradeChat)).toBe(false);
    expect(isMessengerCommerceDirectKey(tradeChat.messengerDirectKey)).toBe(true);
  });
});

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

  it("delivery follows store policy defaults and shows voice and video in dot menu", () => {
    expect(resolveMessengerDotMenuCallVisibility({ callKind: "delivery" })).toEqual({
      showVoice: true,
      showVideo: true,
    });
  });

  it("delivery hides calls when the store policy closes them", () => {
    expect(
      resolveMessengerDotMenuCallVisibility({
        callKind: "delivery",
        deliveryAllowVoiceCall: false,
        deliveryAllowVideoCall: false,
      })
    ).toEqual({
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

describe("resolveMessengerRoomFeatureGate", () => {
  it("general enables voice messages and calls", () => {
    expect(resolveMessengerRoomFeatureGate({ callKind: "general" })).toEqual({
      allowVoiceMessage: true,
      allowVoiceCall: true,
      allowVideoCall: true,
    });
  });

  it("trade uses the seller voice and video policy for voice features", () => {
    expect(
      resolveMessengerRoomFeatureGate({
        callKind: "trade",
        tradeAllowCall: true,
        tradeVideoCallEnabled: false,
      })
    ).toEqual({
      allowVoiceMessage: true,
      allowVoiceCall: true,
      allowVideoCall: false,
    });
    expect(
      resolveMessengerRoomFeatureGate({
        callKind: "trade",
        tradeAllowCall: false,
        tradeVideoCallEnabled: true,
      })
    ).toEqual({
      allowVoiceMessage: false,
      allowVoiceCall: false,
      allowVideoCall: false,
    });
  });

  it("delivery can be closed by store policy without changing the shared builder", () => {
    expect(
      resolveMessengerRoomFeatureGate({
        callKind: "delivery",
        deliveryAllowVoiceMessage: true,
        deliveryAllowVoiceCall: false,
        deliveryAllowVideoCall: false,
      })
    ).toEqual({
      allowVoiceMessage: true,
      allowVoiceCall: false,
      allowVideoCall: false,
    });
  });
});
