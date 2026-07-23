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

function boot(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return { chats, groups: [] } as unknown as CommunityMessengerBootstrap;
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

describe("messenger-room-unread-authority Bottom recount", () => {
  afterEach(() => {
    __resetOwnerHubBadgeStoreForTest();
    __resetDomainListProjectionsForTest();
    __resetMessengerRoomUnreadAuthorityForTest();
    clearLocalReadGuardsForTests();
    clearBootstrapCache();
  });

  it("absolute recount sets hub CM for GD room via domain projection", () => {
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

    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-1",
      viewerUserId: "u1",
      unreadCount: 2,
    });
    expect(out.unreadCount).toBe(2);
    expect(out.bottomRoomCount).toBe(1);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("does not count trade room toward Bottom", () => {
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

    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "tr-1",
      viewerUserId: "u1",
      unreadCount: 3,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("excludes Domain-unknown from Bottom but still stores fact", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 5, total: 5 },
      "network_fresh",
    );
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "unknown-room",
      viewerUserId: "u1",
      unreadCount: 1,
    });
    expect(out.hubSynced).toBe(false);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(5);
    expect(recountBottomChatUnreadRoomCount("u1")).toBe(0);
  });

  it("counts GD via home bootstrap when domain projection empty", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 0, total: 0 },
      "network_fresh",
    );
    primeBootstrapCache(
      boot([
        room({
          id: "gd-home",
          chatDomain: "general_direct",
          unreadCount: 0,
          lastMessageAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    );
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-home",
      viewerUserId: "u1",
      unreadCount: 4,
      lastMessageAt: "2026-01-02T00:00:00.000Z",
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("decrements Bottom when GD unread clears to 0", () => {
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
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-2",
      viewerUserId: "u1",
      unreadCount: 0,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("participant_rt admits unread under local-read-guard even with empty lastMessageAt", () => {
    const ts = "2026-01-02T00:00:00.000Z";
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
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 0, total: 0 },
      "network_fresh",
    );
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-g",
      viewerUserId: "u1",
      unreadCount: 5,
      lastMessageAt: null,
      source: "participant_rt",
      prevUnreadHint: 0,
    });
    expect(out.suppressed).toBe(false);
    expect(out.unreadCount).toBe(5);
    expect(out.hubSynced).toBe(true);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("default source still suppresses stale unread when lastMessageAt is not newer", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "gd-g2", referenceLastMessageAt: ts, source: "manual" });
    const out = applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-g2",
      viewerUserId: "u1",
      unreadCount: 5,
      lastMessageAt: ts,
      source: "default",
    });
    expect(out.suppressed).toBe(true);
    expect(out.unreadCount).toBe(0);
  });

  it("eligible contribution bumps hub without full seed wipe", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 4, total: 4 },
      "network_fresh",
    );
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
    /** Full seed present → absolute recount of known rooms (1 after fact). */
    applyMessengerRoomUnreadFactAndSyncBottom({
      roomId: "gd-only",
      viewerUserId: "u1",
      unreadCount: 2,
      source: "participant_rt",
      prevUnreadHint: 0,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });
});
