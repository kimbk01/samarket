import { describe, expect, it } from "vitest";
import { resolveTradeViewerRole } from "@/lib/messenger/trade/viewer-role";
import {
  looksLikeTradeStatusChangePreview,
  normalizeTradeListPreviewLine,
  resolveTradeItemStatus,
} from "@/lib/messenger/trade/item-status";
import {
  compareTradeListSortKeys,
  filterTradeListRowsByRole,
  sortTradeListRows,
} from "@/lib/messenger/trade/list-sort-filter";
import { buildTradeListSnapshot, buildTradeListViewModel, buildTradeIdentity, TRADE_DOMAIN } from "@/lib/messenger/trade";
import type { TradeRoomInput } from "@/lib/messenger/trade/types";

function tradeRoom(
  partial: Partial<TradeRoomInput> & { roomId: string; itemId: string }
): TradeRoomInput {
  const seller = partial.sellerUserId ?? "seller-1";
  const counter = partial.counterpartyUserId ?? "buyer-1";
  return {
    roomId: partial.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey:
      partial.domainIdentityKey ??
      buildTradeIdentity({
        itemId: partial.itemId,
        sellerUserId: seller,
        counterpartyUserId: counter,
      }).identityKey,
    itemId: partial.itemId,
    sellerUserId: seller,
    counterpartyUserId: counter,
    itemTitle: partial.itemTitle ?? "Item",
    itemImageUrl: null,
    peerDisplayName: partial.peerDisplayName ?? "Peer",
    peerAvatarUrl: null,
    lastMessage: partial.lastMessage ?? "hello",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    lastMessageIsSystem: partial.lastMessageIsSystem ?? false,
    unreadCount: partial.unreadCount ?? 0,
    tradeStatusLabel: partial.tradeStatusLabel ?? "판매중",
  };
}

describe("trade list presentation contracts", () => {
  it("resolves seller/buyer roles from identity", () => {
    expect(
      resolveTradeViewerRole({
        viewerUserId: "seller-1",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
      })
    ).toBe("seller");
    expect(
      resolveTradeViewerRole({
        viewerUserId: "buyer-1",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
      })
    ).toBe("buyer");
    expect(
      resolveTradeViewerRole({
        viewerUserId: "other",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
      })
    ).toBeNull();
  });

  it("keeps same peer different items as separate rows with roles", () => {
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({ roomId: "r1", itemId: "item-a", peerDisplayName: "Maria" }),
        tradeRoom({ roomId: "r2", itemId: "item-b", peerDisplayName: "Maria" }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows).toHaveLength(2);
    expect(listed.snapshot.rows.every((r) => r.viewerRole === "seller")).toBe(true);
    const vms = listed.snapshot.rows.map(buildTradeListViewModel);
    expect(vms[0]!.peerLabel).toBe("Maria");
    expect(vms[0]!.statusBadge).toBe("판매중");
  });

  it("maps listing status badge separately from status-change preview", () => {
    expect(resolveTradeItemStatus({ sellerListingStateRaw: "reserved" }).statusBadgeLabel).toBe(
      "예약중"
    );
    expect(looksLikeTradeStatusChangePreview("제품의 상태가 예약중으로 변경되었습니다")).toBe(true);
    const normalized = normalizeTradeListPreviewLine({
      previewText: "제품의 상태가 예약중으로 변경되었습니다",
      isSystem: true,
      statusBadgeLabel: "예약중",
    });
    expect(normalized.text).toBe("상태 변경 · 예약중");
    expect(normalized.isSystemEvent).toBe(true);
  });

  it("filters selling/buying without collapsing peer", () => {
    const rows = [
      {
        roomId: "r1",
        viewerRole: "seller" as const,
        unreadCount: 0,
        lastMessageAt: "2026-07-14T12:00:00.000Z",
      },
      {
        roomId: "r2",
        viewerRole: "buyer" as const,
        unreadCount: 1,
        lastMessageAt: "2026-07-14T11:00:00.000Z",
      },
    ];
    expect(filterTradeListRowsByRole(rows, "selling").map((r) => r.roomId)).toEqual(["r1"]);
    expect(filterTradeListRowsByRole(rows, "buying").map((r) => r.roomId)).toEqual(["r2"]);
  });

  it("sorts unread ahead of older activity", () => {
    const sorted = sortTradeListRows([
      {
        roomId: "old-unread",
        viewerRole: "seller" as const,
        unreadCount: 2,
        lastMessageAt: "2026-07-14T10:00:00.000Z",
      },
      {
        roomId: "new-read",
        viewerRole: "buyer" as const,
        unreadCount: 0,
        lastMessageAt: "2026-07-14T12:00:00.000Z",
      },
    ]);
    expect(sorted[0]!.roomId).toBe("old-unread");
    expect(compareTradeListSortKeys(sorted[0]!, sorted[1]!)).toBeLessThan(0);
  });
});
