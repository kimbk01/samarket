import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { clearBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { roomSummaryCountsForBottomChat } from "@/lib/community-messenger/notifications/bottom-chat-live-room-count";
import {
  setLocalReadGuard,
  clearLocalReadGuardsForTests,
} from "@/lib/community-messenger/read/local-read-guard";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  __resetMessengerRoomUnreadAuthorityForTest,
  applyMessengerRoomUnreadFactAndSyncBottom,
  recountBottomChatUnreadRoomCount,
} from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { EMPTY_BELL_BADGE_FACTS } from "@/lib/notifications/build-notification-badge-projection";
import {
  commitCompleteProjectionSnapshot,
  resetProjectionAuthorityForTests,
} from "@/lib/notifications/projection-authority";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & { id: string }
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

function boot(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return { chats, groups: [] } as unknown as CommunityMessengerBootstrap;
}

function seedComplete(gd = 0, group = 0, versionMs = 1_000): void {
  commitCompleteProjectionSnapshot(
    {
      domainUnreadRooms: {
        general_direct: gd,
        group,
        trade: 0,
        store_order: 0,
      },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 0,
      orphanMissedCall: 0,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      unreadApprovedNotificationEvents: 7,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 7 },
      rowUnreadByRoomId: {},
    },
    { projectionVersionMs: versionMs }
  );
}

describe("roomSummaryCountsForBottomChat", () => {
  it("includes general_direct and group; excludes trade and store_order", () => {
    expect(roomSummaryCountsForBottomChat(room({ id: "a", chatDomain: "general_direct" }))).toBe(
      true
    );
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "b", chatDomain: "group", roomType: "private_group" })
      )
    ).toBe(true);
    expect(roomSummaryCountsForBottomChat(room({ id: "c", chatDomain: "trade" }))).toBe(false);
    expect(roomSummaryCountsForBottomChat(room({ id: "d", chatDomain: "store_order" }))).toBe(false);
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "e", chatDomain: null, messengerDirectKey: "trade_pc:x" })
      )
    ).toBe(false);
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "f", chatDomain: null, messengerDirectKey: "store_order:y" })
      )
    ).toBe(false);
    expect(
      roomSummaryCountsForBottomChat(
        room({ id: "g", chatDomain: null, messengerDirectKey: "a:b", roomType: "direct" })
      )
    ).toBe(true);
  });
});

describe("messenger-room-unread-authority → Projection Authority", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    __resetOwnerHubBadgeStoreForTest();
    __resetDomainListProjectionsForTest();
    __resetMessengerRoomUnreadAuthorityForTest();
    resetProjectionAuthorityForTests();
    clearLocalReadGuardsForTests();
    clearBootstrapCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("room fact updates Hub CM via Authority (no Absolute writer)", () => {
    seedComplete(0, 0, 1_000);
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

    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-1",
      viewerUserId: "u1",
      unreadCount: 2,
      prevUnreadHint: 0,
      versionMs: 2_000,
      eventIdentity: "t-gd-1-up",
    });
    expect(out.unreadCount).toBe(2);
    expect(out.authorityApplied).toBe(true);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("does not count trade room toward Bottom / Authority", () => {
    seedComplete(0, 0, 1_000);
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

    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "tr-1",
      viewerUserId: "u1",
      unreadCount: 3,
      prevUnreadHint: 0,
      versionMs: 2_000,
      eventIdentity: "t-tr-1",
    });
    expect(out.authorityApplied).toBe(false);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("excludes Domain-unknown from Authority but still stores local fact", () => {
    seedComplete(0, 0, 1_000);
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 5, total: 5 },
      "network_fresh"
    );
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "unknown-room",
      viewerUserId: "u1",
      unreadCount: 1,
      versionMs: 2_000,
      eventIdentity: "t-unknown",
    });
    expect(out.hubSynced).toBe(false);
    expect(out.authorityApplied).toBe(false);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(5);
    expect(recountBottomChatUnreadRoomCount("u1")).toBe(0);
  });

  it("counts GD via home bootstrap when domain projection empty", () => {
    seedComplete(0, 0, 1_000);
    primeBootstrapCache(
      boot([
        room({
          id: "gd-home",
          chatDomain: "general_direct",
          unreadCount: 0,
          lastMessageAt: "2026-01-02T00:00:00.000Z",
        }),
      ])
    );
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-home",
      viewerUserId: "u1",
      unreadCount: 4,
      prevUnreadHint: 0,
      lastMessageAt: "2026-01-02T00:00:00.000Z",
      versionMs: 2_000,
      eventIdentity: "t-gd-home",
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("decrements Bottom when GD unread clears to 0", () => {
    seedComplete(1, 0, 1_000);
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
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-2",
      viewerUserId: "u1",
      unreadCount: 0,
      prevUnreadHint: 1,
      versionMs: 2_000,
      eventIdentity: "t-gd-2-read",
      authoritySource: "optimistic_read",
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("participant_rt admits unread under local-read-guard even with empty lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    seedComplete(0, 0, 1_000);
    setLocalReadGuard({ roomId: "gd-g", referenceLastMessageAt: ts, source: "manual" });
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: 1,
      items: [
        {
          roomId: "gd-g",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 0,
          lastMessageAt: ts,
          title: "x",
        },
      ],
    });
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-g",
      viewerUserId: "u1",
      unreadCount: 5,
      lastMessageAt: null,
      source: "participant_rt",
      prevUnreadHint: 0,
      versionMs: 2_000,
      eventIdentity: "t-gd-g-rt",
    });
    expect(out.suppressed).toBe(false);
    expect(out.unreadCount).toBe(5);
    expect(out.hubSynced).toBe(true);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("default source still suppresses stale unread when lastMessageAt is not newer", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    seedComplete(0, 0, 1_000);
    setLocalReadGuard({ roomId: "gd-g2", referenceLastMessageAt: ts, source: "manual" });
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: 1,
      items: [
        {
          roomId: "gd-g2",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 0,
          lastMessageAt: ts,
          title: "x",
        },
      ],
    });
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-g2",
      viewerUserId: "u1",
      unreadCount: 5,
      lastMessageAt: ts,
      source: "default",
      prevUnreadHint: 0,
      versionMs: 2_000,
      eventIdentity: "t-gd-g2-stale",
    });
    expect(out.suppressed).toBe(true);
    expect(out.unreadCount).toBe(0);
  });

  it("Authority room fact bump without Absolute recount writer", () => {
    seedComplete(0, 0, 1_000);
    applyGeneralDirectListProjection({
      chatDomain: "general_direct",
      versionMs: 1,
      items: [
        {
          roomId: "gd-only",
          chatDomain: "general_direct",
          domainIdentity: "general_direct:a:b",
          unreadCount: 0,
          lastMessageAt: null,
          title: "x",
        },
      ],
    });
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-only",
      viewerUserId: "u1",
      unreadCount: 2,
      source: "participant_rt",
      prevUnreadHint: 0,
      versionMs: 2_000,
      eventIdentity: "t-gd-only",
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });
});
