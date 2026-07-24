/**
 * @vitest-environment jsdom
 * Telegram-style list authority — 12-item contract tests.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowedFieldsForListMutation,
  assertListMutationFields,
  isServerLastMessageAtStale,
  logListAuthorityViolation,
} from "@/lib/chat-domain/list/domain-list-mutation-contract";
import {
  applyDomainTradeListRealtimeMessagePatch,
  applyDomainTradeListReadPatch,
  applyDomainTradeListUnreadOnlyPatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import {
  clearDomainTradeListCanaryCache,
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import {
  applyHomeListPatch,
  stripCommerceDomainRowsFromHubLists,
} from "@/lib/community-messenger/home-list-patch";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

const UID = "viewer-telegram-list-authority";

function tradeRow(
  partial: Partial<TradeListDto["rows"][number]> & Pick<TradeListDto["rows"][number], "roomId" | "previewText" | "lastMessageAt" | "unreadCount">
): TradeListDto["rows"][number] {
  const roomId = partial.roomId;
  const seller = partial.sellerUserId ?? UID;
  const buyer = partial.buyerUserId ?? "buyer-peer";
  return {
    roomId,
    chatDomain: "trade",
    domainIdentityKey: partial.domainIdentityKey ?? `trade:item-${roomId}:${seller}:${buyer}`,
    itemId: partial.itemId ?? `item-${roomId}`,
    sellerUserId: seller,
    buyerUserId: buyer,
    viewerRole: partial.viewerRole ?? "seller",
    productTitle: partial.productTitle ?? "p",
    productImageUrl: partial.productImageUrl ?? null,
    peerLabel: partial.peerLabel ?? "peer",
    peerAvatarUrl: partial.peerAvatarUrl ?? null,
    previewText: partial.previewText,
    statusBadge: partial.statusBadge ?? null,
    unreadCount: partial.unreadCount,
    needsResponse: partial.needsResponse ?? partial.unreadCount > 0,
    previewIsSystemEvent: partial.previewIsSystemEvent ?? false,
    lastMessageAt: partial.lastMessageAt,
    href: partial.href ?? `/community-messenger/rooms/${roomId}`,
  };
}

function seedTrade(rows: TradeListDto["rows"]): void {
  primeDomainTradeListCanaryCache({
    authority: "domain_trade_list_canary",
    viewerUserId: UID,
    producedAt: "2026-07-24T00:00:00.000Z",
    hub: {
      roomCount: rows.length,
      unreadRoomCount: rows.filter((r) => r.unreadCount > 0).length,
      latestRoomId: rows[0]?.roomId ?? null,
      previewText: rows[0]?.previewText ?? "",
    },
    rows,
  });
}

function emptyBootstrap(): CommunityMessengerBootstrap {
  return {
    chats: [],
    groups: [],
    requests: [],
    friends: [],
    tabs: { chats: 0, groups: 0, requests: 0 },
  } as unknown as CommunityMessengerBootstrap;
}

describe("telegram list authority mutation contract", () => {
  beforeEach(() => {
    clearDomainTradeListCanaryCache(UID);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("1 MARK_READ → unread only", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "hello",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 3,
      }),
    ]);
    applyDomainTradeListReadPatch({ viewerUserId: UID, roomId: "r1" });
    const row = peekDomainTradeListCanaryCache(UID)?.rows[0];
    expect(row?.unreadCount).toBe(0);
    expect(row?.previewText).toBe("hello");
    expect(row?.lastMessageAt).toBe("2026-07-24T10:00:00.000Z");
    expect([...allowedFieldsForListMutation("MARK_READ")]).toEqual(["unreadCount"]);
  });

  it("2 PARTICIPANT_UNREAD → unread only (no preview)", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "old",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 1,
      }),
    ]);
    applyDomainTradeListUnreadOnlyPatch({
      viewerUserId: UID,
      roomId: "r1",
      unreadCount: 5,
      mutationType: "PARTICIPANT_UNREAD",
    });
    const row = peekDomainTradeListCanaryCache(UID)?.rows[0];
    expect(row?.unreadCount).toBe(5);
    expect(row?.previewText).toBe("old");
  });

  it("3 MESSAGE_RECEIVED bumps tip + unread", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "old",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 0,
      }),
    ]);
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "r1",
      previewText: "new",
      lastMessageAt: "2026-07-24T11:00:00.000Z",
      boostUnread: true,
    });
    const row = peekDomainTradeListCanaryCache(UID)?.rows[0];
    expect(row?.previewText).toBe("new");
    expect(row?.unreadCount).toBe(1);
  });

  it("4 MESSAGE_SENT updates tip without unread boost", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "old",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 2,
      }),
    ]);
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "r1",
      previewText: "mine",
      lastMessageAt: "2026-07-24T11:00:00.000Z",
      boostUnread: false,
    });
    const row = peekDomainTradeListCanaryCache(UID)?.rows[0];
    expect(row?.previewText).toBe("mine");
    expect(row?.unreadCount).toBe(2);
  });

  it("5 stale server LMA rejected", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "fresh",
        lastMessageAt: "2026-07-24T12:00:00.000Z",
        unreadCount: 0,
      }),
    ]);
    expect(isServerLastMessageAtStale("2026-07-24T12:00:00.000Z", "2026-07-24T11:00:00.000Z")).toBe(
      true
    );
    const ok = applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "r1",
      previewText: "stale",
      lastMessageAt: "2026-07-24T11:00:00.000Z",
      boostUnread: true,
    });
    expect(ok).toBe(false);
    expect(peekDomainTradeListCanaryCache(UID)?.rows[0]?.previewText).toBe("fresh");
  });

  it("6 same LMA unread-only does not reorder", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        productTitle: "a",
        previewText: "a",
        lastMessageAt: "2026-07-24T12:00:00.000Z",
        unreadCount: 1,
      }),
      tradeRow({
        roomId: "r2",
        productTitle: "b",
        previewText: "b",
        lastMessageAt: "2026-07-24T11:00:00.000Z",
        unreadCount: 0,
      }),
    ]);
    applyDomainTradeListReadPatch({ viewerUserId: UID, roomId: "r1" });
    const rows = peekDomainTradeListCanaryCache(UID)?.rows ?? [];
    expect(rows[0]?.roomId).toBe("r1");
    expect(rows[0]?.unreadCount).toBe(0);
  });

  it("7 remount fetch 0: hydrated peek present", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "x",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 0,
      }),
    ]);
    expect(peekDomainTradeListCanaryCache(UID)).not.toBeNull();
  });

  it("8 mark_read fail must not require preview write", () => {
    expect([...allowedFieldsForListMutation("MARK_READ")]).not.toContain("previewText");
  });

  it("9 domain isolation: hub strips trade/store_order", () => {
    const boot = emptyBootstrap();
    boot.chats = [
      {
        id: "gd1",
        title: "gd",
        chatDomain: "general_direct",
        unreadCount: 0,
        lastMessageAt: "2026-07-24T10:00:00.000Z",
      } as never,
      {
        id: "tr1",
        title: "trade",
        chatDomain: "trade",
        unreadCount: 1,
        lastMessageAt: "2026-07-24T11:00:00.000Z",
      } as never,
    ];
    const stripped = stripCommerceDomainRowsFromHubLists(boot);
    expect(stripped.chats?.map((r) => r.id)).toEqual(["gd1"]);
  });

  it("10 duplicate identical message event no-ops", () => {
    seedTrade([
      tradeRow({
        roomId: "r1",
        previewText: "same",
        lastMessageAt: "2026-07-24T10:00:00.000Z",
        unreadCount: 0,
      }),
    ]);
    const ok = applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "r1",
      previewText: "same",
      lastMessageAt: "2026-07-24T10:00:00.000Z",
      boostUnread: false,
    });
    expect(ok).toBe(false);
  });

  it("11 METADATA allowed fields exclude unread", () => {
    expect(allowedFieldsForListMutation("METADATA_HYDRATE").has("unreadCount")).toBe(false);
    expect(allowedFieldsForListMutation("METADATA_HYDRATE").has("title")).toBe(true);
  });

  it("12 multi-tab reducer-only: applyHomeListPatch local_unread is hub SSOT", () => {
    const prev = emptyBootstrap();
    prev.chats = [
      {
        id: "gd1",
        title: "gd",
        chatDomain: "general_direct",
        unreadCount: 2,
        lastMessageAt: "2026-07-24T10:00:00.000Z",
      } as never,
    ];
    const next = applyHomeListPatch(
      prev,
      { kind: "local_unread", roomId: "gd1", unreadCount: 0 },
      "mark-read"
    );
    expect(next?.chats?.[0]?.unreadCount).toBe(0);
  });

  it("PREVIEW_WRITE_FROM_UNREAD_EVENT logs on assert", () => {
    const spy = vi.mocked(console.warn);
    assertListMutationFields({
      type: "MARK_READ",
      changedFields: ["previewText"],
      surface: "trade",
      roomId: "r1",
    });
    expect(spy).toHaveBeenCalled();
    logListAuthorityViolation("ROOM_RETURN_FETCH_ATTEMPT", { surface: "hub_gd_group" });
  });

  it("13 dual-write module file is deleted", () => {
    expect(
      existsSync(join(process.cwd(), "lib/chat-domain/list/dual-write-domain-list-from-rooms.ts"))
    ).toBe(false);
  });

  it("14 hub spine mirror uses applyHomeListPatch only", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/domain-room-state-store.ts"),
      "utf8"
    );
    expect(src).toContain("applyHomeListPatch");
    expect(src).not.toContain("patchBootstrapRoomListForRealtimeMessageInsert");
    expect(src).not.toContain("patchBootstrapRoomListForSenderLocalEcho");
  });

  it("15 participant unread-only fields lock", () => {
    expect([...allowedFieldsForListMutation("PARTICIPANT_UNREAD")]).toEqual(["unreadCount"]);
  });

  it("16 mark_read effect does not rollback list optimistic on viewport miss", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"),
      "utf8"
    );
    expect(src).toContain("listOptimisticApplied");
    expect(src).toMatch(/if \(!candidate\) \{\s*\n\s*\/\*\*/);
    expect(src).not.toMatch(/if \(!candidate\) \{\s*\n\s*maybeRollbackEarlyOptimisticBadge\(reason\)/);
  });
});
