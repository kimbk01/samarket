/**
 * Phase 11B-Fix — Hub/Preview 정합 (Trade · Store Order).
 */
import { describe, expect, it } from "vitest";
import { selectLatestRowByActivityAt } from "@/lib/messenger/contracts/latest-activity-selector";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import {
  TRADE_EMPTY_CONVERSATION_PREVIEW,
  resolveTradePreview,
} from "@/lib/messenger/trade/preview";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { buildTradeListSnapshot } from "@/lib/messenger/trade/list";
import { buildTradeListViewModel } from "@/lib/messenger/trade/row-model";
import type { TradeRoomInput } from "@/lib/messenger/trade/types";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { buildStoreOrderListSnapshot } from "@/lib/messenger/store-order/list";
import {
  STORE_ORDER_EMPTY_CONVERSATION_PREVIEW,
  resolveStoreOrderPreview,
} from "@/lib/messenger/store-order/preview";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import type { StoreOrderRoomInput } from "@/lib/messenger/store-order/types";

function tradeRoom(overrides: Partial<TradeRoomInput> & { roomId: string; itemId: string }): TradeRoomInput {
  const sellerUserId = overrides.sellerUserId ?? "seller-1";
  const counterpartyUserId = overrides.counterpartyUserId ?? "buyer-1";
  const identity = buildTradeIdentity({
    itemId: overrides.itemId,
    sellerUserId,
    counterpartyUserId,
  });
  return {
    roomId: overrides.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: overrides.domainIdentityKey ?? identity.identityKey,
    itemId: overrides.itemId,
    sellerUserId,
    counterpartyUserId,
    itemTitle: overrides.itemTitle ?? "상품",
    itemImageUrl: overrides.itemImageUrl ?? null,
    peerDisplayName: overrides.peerDisplayName ?? "상대",
    peerAvatarUrl: overrides.peerAvatarUrl ?? null,
    lastMessage: overrides.lastMessage ?? "",
    lastMessageAt: overrides.lastMessageAt ?? "",
    unreadCount: overrides.unreadCount ?? 0,
    tradeStatusLabel: overrides.tradeStatusLabel ?? null,
    updatedAt: overrides.updatedAt ?? overrides.lastMessageAt ?? "",
  };
}

function orderRoom(
  overrides: Partial<StoreOrderRoomInput> & { roomId: string; orderId: string }
): StoreOrderRoomInput {
  return {
    roomId: overrides.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: overrides.domainIdentityKey ?? `store_order:${overrides.orderId}`,
    orderId: overrides.orderId,
    storeId: overrides.storeId ?? "store-1",
    storeName: overrides.storeName ?? "매장",
    storeImageUrl: overrides.storeImageUrl ?? null,
    customerUserId: overrides.customerUserId ?? "cust-1",
    customerName: overrides.customerName ?? "고객",
    customerAvatarUrl: overrides.customerAvatarUrl ?? null,
    latestChatMessageText: overrides.latestChatMessageText ?? "",
    latestChatMessageType: overrides.latestChatMessageType ?? "text",
    latestChatMessageAt: overrides.latestChatMessageAt ?? "",
    unreadCount: overrides.unreadCount ?? 0,
    orderStatusLabel: overrides.orderStatusLabel ?? null,
  };
}

describe("Phase 11B-Fix trade Hub authority", () => {
  it("hub matches newest lastMessageAt row among 3; invalid empty at never wins", () => {
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({
          roomId: "old",
          itemId: "i1",
          lastMessage: "old",
          lastMessageAt: "2026-07-07T13:40:46.578+00:00",
          unreadCount: 1,
        }),
        tradeRoom({
          roomId: "empty",
          itemId: "i2",
          lastMessage: "",
          lastMessageAt: "",
          unreadCount: 0,
        }),
        tradeRoom({
          roomId: "new",
          itemId: "i3",
          lastMessage: "newest",
          lastMessageAt: "2026-07-14T05:53:51.155+00:00",
          unreadCount: 1,
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildTradeHubViewModel(listed.snapshot.rows);
    const sorted0 = selectLatestRowByActivityAt(listed.snapshot.rows, (r) => ({
      activityAt: r.lastMessageAt,
      tieKey: r.roomId,
    }))!;
    const vm0 = buildTradeListViewModel(sorted0);
    expect(hub.roomCount).toBe(3);
    expect(hub.unreadCount).toBe(2);
    expect(hub.latestRoomId).toBe("new");
    expect(hub.latestRoomId).toBe(sorted0.roomId);
    expect(hub.lastEventAt).toBe(sorted0.lastMessageAt);
    expect(hub.previewText).toBe(vm0.previewText);
    expect(hub.previewText).toBe("newest");
  });

  it("identical timestamps use deterministic roomId tie-break", () => {
    const at = "2026-07-14T05:53:51.155+00:00";
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({ roomId: "aaa", itemId: "i1", lastMessage: "a", lastMessageAt: at }),
        tradeRoom({ roomId: "zzz", itemId: "i2", lastMessage: "z", lastMessageAt: at }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildTradeHubViewModel(listed.snapshot.rows);
    expect(hub.latestRoomId).toBe("zzz");
    expect(hub.previewText).toBe("z");
  });

  it("empty preview uses explicit empty phrase — not status/summary", () => {
    expect(resolveTradePreview({ content: "", messageType: "text" }).text).toBe(
      TRADE_EMPTY_CONVERSATION_PREVIEW
    );
    expect(() =>
      resolveTradePreview({ content: "상품 요약 blah", messageType: "text" })
    ).toThrow(/forbidden/);
    const listed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRoom({
          roomId: "r1",
          itemId: "i1",
          lastMessage: "",
          lastMessageAt: "",
          tradeStatusLabel: "예약중",
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildTradeHubViewModel(listed.snapshot.rows);
    expect(hub.previewText).toBe(TRADE_EMPTY_CONVERSATION_PREVIEW);
    expect(hub.previewText).not.toBe("예약중");
  });

  it("allowed system message can be hub preview", () => {
    expect(
      resolveTradePreview({
        content: "제품의 상태가 예약중으로 변경되었습니다.",
        messageType: "system",
        isSystemAllowed: true,
      }).source
    ).toBe("allowed_system_message");
  });
});

describe("Phase 11B-Fix store_order Hub authority", () => {
  it("customer hub matches newest customer row", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({
          roomId: "r-old",
          orderId: "o1",
          latestChatMessageText: "old",
          latestChatMessageAt: "2026-07-01T00:00:00.000Z",
          unreadCount: 1,
        }),
        orderRoom({
          roomId: "r-empty",
          orderId: "o2",
          latestChatMessageText: "",
          latestChatMessageAt: "",
        }),
        orderRoom({
          roomId: "r-new",
          orderId: "o3",
          storeName: "매장A",
          latestChatMessageText: "new",
          latestChatMessageAt: "2026-07-14T05:51:01.993+00:00",
          unreadCount: 1,
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildStoreOrderHubViewModel(listed.snapshot.rows);
    expect(hub.latestRoomId).toBe("r-new");
    expect(hub.previewText).toBe("new");
    expect(hub.roomCount).toBe(3);
    expect(hub.unreadCount).toBe(2);
    expect(hub.lastEventAt).toBe("2026-07-14T05:51:01.993+00:00");
  });

  it("owner hub matches newest owner row; same store keeps separate orders", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "owner-1",
      generation: "1",
      rooms: [
        orderRoom({
          roomId: "r1",
          orderId: "ord-a",
          storeId: "store-1",
          customerName: "A",
          latestChatMessageText: "a",
          latestChatMessageAt: "2026-07-10T00:00:00.000Z",
        }),
        orderRoom({
          roomId: "r2",
          orderId: "ord-b",
          storeId: "store-1",
          customerName: "B",
          latestChatMessageText: "b-latest",
          latestChatMessageAt: "2026-07-14T00:00:00.000Z",
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows).toHaveLength(2);
    const hub = buildStoreOrderHubViewModel(listed.snapshot.rows);
    expect(hub.latestRoomId).toBe("r2");
    expect(hub.previewText).toBe("b-latest");
  });

  it("empty preview phrase — not order status", () => {
    expect(
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "", messageType: "text" },
      }).text
    ).toBe(STORE_ORDER_EMPTY_CONVERSATION_PREVIEW);
  });
});
