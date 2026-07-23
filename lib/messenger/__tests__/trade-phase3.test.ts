import { describe, expect, it } from "vitest";
import { composeMessengerTabBadge } from "@/lib/messenger/shell";
import {
  acceptTradeBootstrap,
  assertHomeInboxRejectsTradeDomain,
  assertTradeOwnedRoom,
  assertTradePreviewDoesNotUseMetadata,
  assertTradeReadAllowed,
  assertTradeViewerPermission,
  buildTradeBadgeContribution,
  buildTradeCacheKey,
  buildTradeHeaderModel,
  buildTradeHubViewModel,
  buildTradeIdentity,
  buildTradeListSnapshot,
  buildTradeListViewModel,
  buildTradeMarkReadPayload,
  countTradeUnreadRooms,
  mergeTradePartialBootstrap,
  parseTradeIdentityKey,
  resolveTradeNotificationDisplay,
  resolveTradePresentation,
  resolveTradePreview,
  resolveTradeSoundKey,
  TRADE_DOMAIN,
  TRADE_LIST_HREF,
  TRADE_SOUND_EVENT_KEY,
  TradeReadonlyMemoryCache,
  tradePorts,
  tradeStatusBadgeSeparated,
  type TradeRoomInput,
} from "@/lib/messenger/trade";

function tradeRoom(
  partial: Partial<TradeRoomInput> & {
    roomId: string;
    itemId: string;
    sellerUserId?: string;
    counterpartyUserId?: string;
  }
): TradeRoomInput {
  const seller = partial.sellerUserId ?? "seller-1";
  const counter = partial.counterpartyUserId ?? "buyer-1";
  const identity =
    partial.domainIdentityKey ??
    buildTradeIdentity({
      itemId: partial.itemId,
      sellerUserId: seller,
      counterpartyUserId: counter,
    }).identityKey;
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? TRADE_DOMAIN,
    domainIdentityKey: identity,
    itemId: partial.itemId,
    sellerUserId: seller,
    counterpartyUserId: counter,
    itemTitle: partial.itemTitle ?? "중고 자전거",
    itemImageUrl: partial.itemImageUrl ?? "https://cdn/item.png",
    peerDisplayName: partial.peerDisplayName ?? "구매자",
    peerAvatarUrl: partial.peerAvatarUrl ?? null,
    lastMessage: partial.lastMessage ?? "네고 가능?",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    tradeStatusLabel: partial.tradeStatusLabel ?? "판매중",
  };
}

describe("Phase 3 trade Identity", () => {
  it("builds item+seller+counterparty identity; different item → different key", () => {
    const a = buildTradeIdentity({
      itemId: "item-a",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    });
    const b = buildTradeIdentity({
      itemId: "item-b",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    });
    expect(a.identityKey).toBe("trade:item-a:seller-1:buyer-1");
    expect(b.identityKey).toBe("trade:item-b:seller-1:buyer-1");
    expect(a.identityKey).not.toBe(b.identityKey);
    expect(parseTradeIdentityKey(a.identityKey)).toEqual({
      itemId: "item-a",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    });
  });

  it("rejects foreign identities", () => {
    expect(() => parseTradeIdentityKey("general_direct:a:b")).toThrow(/general_direct_identity_forbidden/);
    expect(() => parseTradeIdentityKey("group:r")).toThrow(/foreign_identity/);
    expect(() => parseTradeIdentityKey("store_order:o")).toThrow(/foreign_identity/);
    expect(() =>
      assertTradeOwnedRoom({
        roomId: "r",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:a:b",
      })
    ).toThrow(/domain_required/);
  });
});

describe("Phase 3 trade List / Hub", () => {
  it("returns trade-only one row per room; same peer different item → 2 rows", () => {
    const result = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({ roomId: "r1", itemId: "item-a", lastMessage: "m1" }),
        tradeRoom({ roomId: "r2", itemId: "item-b", lastMessage: "m2" }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.rows).toHaveLength(2);
    expect(result.snapshot.rows.every((r) => r.chatDomain === TRADE_DOMAIN)).toBe(true);
  });

  it("many messages still one list row; duplicate identity fails", () => {
    const one = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRoom({ roomId: "r1", itemId: "item-a", lastMessage: "last of many" })],
    });
    expect(one.ok && one.snapshot.rows).toHaveLength(1);
    const dup = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({ roomId: "r1", itemId: "item-a" }),
        tradeRoom({ roomId: "r2", itemId: "item-a" }),
      ],
    });
    expect(dup.ok).toBe(false);
  });

  it("rejects general/group/store_order", () => {
    expect(
      buildTradeListSnapshot({
        viewerUserId: "s",
        generation: "1",
        rooms: [tradeRoom({ roomId: "r", itemId: "i", chatDomain: "general_direct", domainIdentityKey: "general_direct:a:b" })],
      }).ok
    ).toBe(false);
    expect(
      buildTradeListSnapshot({
        viewerUserId: "s",
        generation: "1",
        rooms: [tradeRoom({ roomId: "r", itemId: "i", chatDomain: "store_order", domainIdentityKey: "store_order:o" })],
      }).ok
    ).toBe(false);
  });

  it("hub delivers TradeHubViewModel only; inbox rejects trade domain", () => {
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({ roomId: "r1", itemId: "item-a", unreadCount: 1, lastMessage: "최신", lastMessageAt: "2026-07-14T13:00:00.000Z" }),
        tradeRoom({ roomId: "r2", itemId: "item-b", unreadCount: 0, lastMessageAt: "2026-07-14T10:00:00.000Z" }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildTradeHubViewModel(listed.snapshot.rows);
    expect(hub.hrefToTradeList).toBe(TRADE_LIST_HREF);
    expect(hub.roomCount).toBe(2);
    expect(hub.unreadCount).toBe(1);
    expect(hub.previewText).toBe("최신");
    expect(() => assertHomeInboxRejectsTradeDomain()).toThrow(/forbids_domain/);
  });
});

describe("Phase 3 trade Presentation / Header / Preview / Row", () => {
  it("uses product + peer; forbids general-direct-only surface", () => {
    const key = buildTradeIdentity({
      itemId: "item-a",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    }).identityKey;
    const p = resolveTradePresentation({
      roomId: "r1",
      chatDomain: TRADE_DOMAIN,
      domainIdentityKey: key,
      itemTitle: "중고 자전거",
      itemImageUrl: "https://cdn/item.png",
      peerDisplayName: "구매자",
    });
    expect(p.productTitle).toBe("중고 자전거");
    expect(p.productImageUrl).toContain("item.png");
    expect(p.peerLabel).toBe("구매자");
    expect(() =>
      resolveTradePresentation({
        roomId: "r1",
        chatDomain: TRADE_DOMAIN,
        domainIdentityKey: key,
        itemTitle: "x",
        itemImageUrl: null,
        peerDisplayName: "y",
        useGeneralDirectSurfaceOnly: true,
      })
    ).toThrow(/general_direct_surface/);
  });

  it("header accepts trade only", () => {
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRoom({ roomId: "r1", itemId: "item-a" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const header = buildTradeHeaderModel(listed.snapshot.rows[0]!);
    expect(header.kind).toBe("trade");
    expect(header.forbidsGeneralDirectHeader).toBe(true);
    expect(() =>
      buildTradeHeaderModel({
        ...listed.snapshot.rows[0]!,
        chatDomain: "general_direct" as typeof TRADE_DOMAIN,
      })
    ).toThrow(/header_rejects|domain_required/);
  });

  it("preview keeps latest message; status badge separated", () => {
    expect(resolveTradePreview({ content: "네고 가능?", messageType: "text" }).text).toBe("네고 가능?");
    expect(() =>
      resolveTradePreview({ content: "상품 요약 blah", messageType: "text" })
    ).toThrow(/summary_forbidden/);
    expect(() =>
      assertTradePreviewDoesNotUseMetadata({ statusAsPreview: "판매완료", roomTitleAsPreview: "x" })
    ).toThrow(/metadata_forbidden/);
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRoom({ roomId: "r1", itemId: "item-a", tradeStatusLabel: "판매중", lastMessage: "hi" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = buildTradeListViewModel(listed.snapshot.rows[0]!);
    expect(row.previewText).toBe("hi");
    expect(tradeStatusBadgeSeparated(listed.snapshot.rows[0]!)).toBe("판매중");
    expect(row.previewText).not.toBe("판매중");
  });
});

describe("Phase 3 trade Cache / Bootstrap / Read / Badge / Notif", () => {
  it("cache chat.trade only", () => {
    const key = buildTradeCacheKey({ viewerUserId: "u1", generation: "2" });
    expect(key.startsWith("chat.trade.")).toBe(true);
    const cache = new TradeReadonlyMemoryCache();
    cache.seedForTest(key, []);
    expect(() => cache.writeForbidden()).toThrow(/write_forbidden/);
    expect(() => cache.read("chat.general.x")).toThrow(/namespace_forbidden/);
  });

  it("bootstrap reject foreign; partial preserves prior rows", () => {
    const full = acceptTradeBootstrap({
      viewerUserId: "seller-1",
      generation: "1",
      mode: "full",
      rooms: [tradeRoom({ roomId: "r1", itemId: "item-a" })],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(
      acceptTradeBootstrap({
        viewerUserId: "seller-1",
        generation: "2",
        mode: "full",
        rooms: [tradeRoom({ roomId: "r1", itemId: "item-a", chatDomain: "group", domainIdentityKey: "group:g" })],
      }).ok
    ).toBe(false);
    const merged = mergeTradePartialBootstrap(full.snapshot, {
      generation: "3",
      rooms: [tradeRoom({ roomId: "r2", itemId: "item-b" })],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.rows.map((r) => r.roomId).sort()).toEqual(["r1", "r2"]);
  });

  it("read/badge exclude messenger nav; notification rejects reinference", () => {
    expect(() =>
      assertTradeReadAllowed({
        roomId: "r",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o",
      })
    ).toThrow(/read_rejects/);
    const key = buildTradeIdentity({
      itemId: "item-a",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    }).identityKey;
    expect(buildTradeMarkReadPayload({ roomId: "r1", chatDomain: TRADE_DOMAIN, domainIdentityKey: key }).clearBadgeTargets).toEqual([
      "trade",
    ]);
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRoom({ roomId: "r1", itemId: "item-a", unreadCount: 2 })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const badge = buildTradeBadgeContribution(listed.snapshot.rows);
    expect(badge.navMessengerContribution).toBe(0);
    expect(badge.contributesTo).not.toContain("nav_messenger");
    expect(countTradeUnreadRooms(listed.snapshot.rows)).toBe(1);
    expect(
      composeMessengerTabBadge({ domain: "general_direct", count: 1 }, { domain: "group", count: 1 })
    ).toBe(2);
    expect(() =>
      resolveTradeNotificationDisplay({
        chatDomain: TRADE_DOMAIN,
        domainIdentityKey: key,
        roomId: "r1",
        eventId: "e1",
        productTitle: "중고",
        productImageUrl: null,
        peerDisplayName: "구매자",
        messagePreview: "hi",
        directKey: "trade_pc:x",
      })
    ).toThrow(/reinference/);
    expect(resolveTradeSoundKey().eventKey).toBe(TRADE_SOUND_EVENT_KEY);
    expect(tradePorts.badge.contributesTo).not.toContain("nav_messenger");
  });

  it("permission requires trade party participant", () => {
    const key = buildTradeIdentity({
      itemId: "item-a",
      sellerUserId: "seller-1",
      counterpartyUserId: "buyer-1",
    }).identityKey;
    expect(() =>
      assertTradeViewerPermission({
        viewerUserId: "stranger",
        room: {
          roomId: "r1",
          chatDomain: TRADE_DOMAIN,
          domainIdentityKey: key,
          sellerUserId: "seller-1",
          counterpartyUserId: "buyer-1",
          participantUserIds: ["seller-1", "buyer-1"],
        },
      })
    ).toThrow(/not_participant|not_trade_party/);
  });
});
