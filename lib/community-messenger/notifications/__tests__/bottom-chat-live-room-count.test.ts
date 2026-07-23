import { afterEach, describe, expect, it } from "vitest";
import {
  applyGeneralDirectListProjection,
  applyTradeListProjection,
  __resetDomainListProjectionsForTest,
} from "@/lib/chat-domain/list/domain-list-writers";
import {
  __resetOwnerHubBadgeStoreForTest,
  __testApplyOwnerHubBadgePayloadForTest,
  getOwnerHubBadgeSnapshot,
} from "@/lib/chats/owner-hub-badge-store";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import {
  applyBottomChatLiveRoomCountDelta,
  roomSummaryCountsForBottomChat,
} from "@/lib/community-messenger/notifications/bottom-chat-live-room-count";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & { id: string },
): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    id,
    title: "t",
    roomType: "direct",
    unreadCount: 0,
    lastMessageAt: null,
    summary: null,
    subtitle: null,
    avatarUrl: null,
    peerUserId: null,
    isPinned: false,
    isMuted: false,
    messengerDirectKey: null,
    contextMeta: null,
    chatDomain: null,
    domainIdentity: null,
    ...rest,
  } as CommunityMessengerRoomSummary;
}

describe("roomSummaryCountsForBottomChat", () => {
  it("includes general_direct and group; excludes trade and store_order", () => {
    expect(roomSummaryCountsForBottomChat(room({ id: "a", chatDomain: "general_direct" }))).toBe(
      true,
    );
    expect(
      roomSummaryCountsForBottomChat(room({ id: "b", chatDomain: "group", roomType: "private_group" })),
    ).toBe(true);
    expect(roomSummaryCountsForBottomChat(room({ id: "c", chatDomain: "trade" }))).toBe(false);
    expect(roomSummaryCountsForBottomChat(room({ id: "d", chatDomain: "store_order" }))).toBe(false);
  });

  it("excludes commerce directKey when chatDomain absent", () => {
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "t", messengerDirectKey: "trade_item:x:y:z", chatDomain: null }),
      ),
    ).toBe(false);
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "s", messengerDirectKey: "store_order:oid", chatDomain: null }),
      ),
    ).toBe(false);
  });
});

describe("applyBottomChatLiveRoomCountDelta", () => {
  afterEach(() => {
    __resetOwnerHubBadgeStoreForTest();
    __resetDomainListProjectionsForTest();
  });

  it("bumps +1 for GD room 0→>0 via domain list projection", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 0, total: 0 },
      "network_fresh",
    );
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: 1,
      items: [
        {
          roomId: "gd-1",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 0,
          lastMessageAt: null,
          title: "x",
        },
      ],
    });

    expect(
      applyBottomChatLiveRoomCountDelta({
        roomId: "gd-1",
        viewerUserId: "u1",
        prevUnread: 0,
        nextUnread: 2,
      }),
    ).toBe("bumped");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("does not bump for trade room 0→>0", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 0, total: 0 },
      "network_fresh",
    );
    applyTradeListProjection({
      chatDomain: "trade",
      versionMs: 1,
      items: [
        {
          roomId: "tr-1",
          chatDomain: "trade",
          domainIdentity: "trade:i:s:c",
          unreadCount: 0,
          lastMessageAt: null,
          title: "x",
        },
      ],
    });

    expect(
      applyBottomChatLiveRoomCountDelta({
        roomId: "tr-1",
        viewerUserId: "u1",
        prevUnread: 0,
        nextUnread: 3,
      }),
    ).toBe("skipped_domain");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("fail-closes when room Domain is unknown", () => {
    expect(
      applyBottomChatLiveRoomCountDelta({
        roomId: "unknown-room",
        viewerUserId: "u1",
        prevUnread: 0,
        nextUnread: 1,
      }),
    ).toBe("unknown_fail_closed");
  });

  it("decrements on >0→0 for GD room", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 2, total: 2 },
      "network_fresh",
    );
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: 1,
      items: [
        {
          roomId: "gd-2",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 1,
          lastMessageAt: null,
          title: "x",
        },
      ],
    });
    expect(
      applyBottomChatLiveRoomCountDelta({
        roomId: "gd-2",
        viewerUserId: "u1",
        prevUnread: 1,
        nextUnread: 0,
      }),
    ).toBe("bumped");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });
});
