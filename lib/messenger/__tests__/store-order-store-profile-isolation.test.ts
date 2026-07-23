/**
 * Store Order Customer — store profile isolation from owner user profile.
 */
import { describe, expect, it } from "vitest";
import {
  buildStoreOrderCustomerHeaderModel,
  buildStoreOrderListSnapshot,
  resolveStoreOrderCustomerPresentation,
  STORE_ORDER_DOMAIN,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order";
import { composeDomainRoomHeaderChrome } from "@/lib/messenger/contracts/domain-room-header-chrome";
import { resolveDomainRoomHeaderSecondaryText } from "@/components/community-messenger/domain-shell-canary/domain-room-header-chrome-client";
import type { MessageKey } from "@/lib/i18n/messages";

const t = (key: MessageKey, vars?: Record<string, string | number>) => {
  if (vars?.orderNo != null) return `order:${vars.orderNo}`;
  return String(key);
};

function orderRoom(
  partial: Partial<StoreOrderRoomInput> & { roomId: string; orderId: string; storeId: string }
): StoreOrderRoomInput {
  return {
    roomId: partial.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId,
    storeName: partial.storeName ?? "MARKET MARKET",
    storeImageUrl: partial.storeImageUrl === undefined ? "https://cdn/store.png" : partial.storeImageUrl,
    customerUserId: partial.customerUserId ?? "cust-1",
    customerName: partial.customerName ?? "고객A",
    customerAvatarUrl: partial.customerAvatarUrl ?? "https://cdn/owner-as-user.png",
    latestChatMessageText: partial.latestChatMessageText ?? "hi",
    latestChatMessageType: partial.latestChatMessageType ?? "text",
    latestChatMessageAt: partial.latestChatMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    orderStatusLabel: partial.orderStatusLabel ?? "배달완료",
  };
}

describe("store order customer store profile isolation", () => {
  it("1) store image exists → header/list use store image", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [orderRoom({ roomId: "r1", orderId: "ord-1", storeId: "store-1" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = listed.snapshot.rows[0]!;
    const header = buildStoreOrderCustomerHeaderModel(row);
    expect(header.kind).toBe("buyer_store");
    if (header.kind !== "buyer_store") return;
    expect(header.storeName).toBe("MARKET MARKET");
    expect(header.storeImageUrl).toBe("https://cdn/store.png");
    expect(header.storeImageUrl).not.toContain("owner-as-user");
  });

  it("2) store image missing → null store image (no owner user fallback)", () => {
    const p = resolveStoreOrderCustomerPresentation({
      roomId: "r1",
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: "store_order:ord-2",
      storeName: "MARKET MARKET",
      storeImageUrl: null,
    });
    expect(p.surface.storeImageUrl).toBeNull();
    expect(p.display.avatarUrl).toBeNull();
  });

  it("3+4) owner user image present but store image missing — still must not use owner image", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({
          roomId: "r2",
          orderId: "ord-2",
          storeId: "store-1",
          storeImageUrl: null,
          customerAvatarUrl: "https://cdn/owner-personal.png",
          customerName: "OwnerNick",
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const header = buildStoreOrderCustomerHeaderModel(listed.snapshot.rows[0]!);
    expect(header.kind).toBe("buyer_store");
    if (header.kind !== "buyer_store") return;
    expect(header.storeName).toBe("MARKET MARKET");
    expect(header.storeName).not.toBe("OwnerNick");
    expect(header.storeImageUrl).toBeNull();
    expect(header.storeImageUrl).not.toBe("https://cdn/owner-personal.png");
  });

  it("5) same store different orders → separate rows/identities", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({ roomId: "r-a", orderId: "ord-a", storeId: "store-1" }),
        orderRoom({ roomId: "r-b", orderId: "ord-b", storeId: "store-1" }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows).toHaveLength(2);
    expect(listed.snapshot.rows[0]!.domainIdentityKey).not.toBe(
      listed.snapshot.rows[1]!.domainIdentityKey
    );
    expect(listed.snapshot.rows[0]!.orderId).not.toBe(listed.snapshot.rows[1]!.orderId);
  });

  it("6) different store/order identity", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({
          roomId: "r1",
          orderId: "ord-1",
          storeId: "store-a",
          storeName: "Store A",
        }),
        orderRoom({
          roomId: "r2",
          orderId: "ord-2",
          storeId: "store-b",
          storeName: "Store B",
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows[0]!.storeId).toBe("store-a");
    expect(listed.snapshot.rows[1]!.storeId).toBe("store-b");
    const chrome = composeDomainRoomHeaderChrome({
      kind: "buyer_store",
      orderId: "ord-1",
    });
    expect(chrome.profileKind).toBe("store");
    expect(chrome.forbidsGeneralDirectChrome).toBe(true);
    expect(resolveDomainRoomHeaderSecondaryText(chrome.headerSecondary, t)).toContain("order:");
  });
});
