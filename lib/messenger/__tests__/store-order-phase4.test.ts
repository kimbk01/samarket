import { describe, expect, it } from "vitest";
import {
  acceptStoreOrderBootstrap,
  assertHomeInboxRejectsStoreOrderDomain,
  assertStoreOrderOwnedRoom,
  assertStoreOrderReadAllowed,
  assertStoreOrderViewerPermission,
  buildStoreOrderBadgeContribution,
  buildStoreOrderCacheKey,
  buildStoreOrderCustomerHeaderModel,
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderHubViewModel,
  buildStoreOrderIdentity,
  buildStoreOrderListSnapshot,
  buildStoreOrderMarkReadPayload,
  buildStoreOrderOwnerHeaderModel,
  buildStoreOrderOwnerListViewModel,
  countStoreOrderUnreadRooms,
  mergeStoreOrderPartialBootstrap,
  parseStoreOrderIdentityKey,
  resolveStoreOrderCustomerPresentation,
  resolveStoreOrderNotificationDisplay,
  resolveStoreOrderOwnerPresentation,
  resolveStoreOrderPreview,
  resolveStoreOrderSoundKey,
  STORE_ORDER_DOMAIN,
  STORE_ORDER_LIST_HREF,
  STORE_ORDER_PHASE4_APPROVAL_CONDITIONS,
  STORE_ORDER_REQUIRES_DUAL_PRESENTATION_PORTS,
  STORE_ORDER_SOUND_EVENT_KEY,
  StoreOrderReadonlyMemoryCache,
  storeOrderPorts,
  storeOrderStatusBadgeSeparated,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order";

function orderRoom(
  partial: Partial<StoreOrderRoomInput> & { roomId: string; orderId: string }
): StoreOrderRoomInput {
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? STORE_ORDER_DOMAIN,
    domainIdentityKey: partial.domainIdentityKey ?? `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId ?? "store-1",
    storeName: partial.storeName ?? "맛있는집",
    storeImageUrl: partial.storeImageUrl ?? "https://cdn/store.png",
    customerUserId: partial.customerUserId ?? "cust-1",
    customerName: partial.customerName ?? "고객A",
    customerAvatarUrl: partial.customerAvatarUrl ?? null,
    latestChatMessageText: partial.latestChatMessageText ?? "주문 왔습니다",
    latestChatMessageType: partial.latestChatMessageType ?? "text",
    latestChatMessageAt: partial.latestChatMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    orderStatusLabel: partial.orderStatusLabel ?? "준비중",
  };
}

describe("Phase 4 store_order Identity / List / Hub", () => {
  it("locks phase4 approval conditions and dual presentation", () => {
    expect(STORE_ORDER_PHASE4_APPROVAL_CONDITIONS).toContain("no_trade_port_copy_or_rename");
    expect(STORE_ORDER_REQUIRES_DUAL_PRESENTATION_PORTS).toBe(true);
    expect(() =>
      storeOrderPorts.presentation.resolveDisplayIdentity({
        roomId: "r",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
      })
    ).toThrow(/dual_presentation_ports/);
  });

  it("identity is store_order:orderId; same store different order → different keys", () => {
    const a = buildStoreOrderIdentity("order-a");
    const b = buildStoreOrderIdentity("order-b");
    expect(a.identityKey).toBe("store_order:order-a");
    expect(b.identityKey).toBe("store_order:order-b");
    expect(parseStoreOrderIdentityKey(a.identityKey)).toEqual({ orderId: "order-a" });
    expect(() => parseStoreOrderIdentityKey("trade:i:s:b")).toThrow(/foreign_identity/);
    expect(() =>
      assertStoreOrderOwnedRoom({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/domain_required/);
  });

  it("list: store_order only; one row per room; same store two orders → two rows", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({ roomId: "r1", orderId: "o1", storeId: "store-1" }),
        orderRoom({ roomId: "r2", orderId: "o2", storeId: "store-1" }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.snapshot.rows).toHaveLength(2);
    expect(
      buildStoreOrderListSnapshot({
        viewerUserId: "cust-1",
        generation: "1",
        rooms: [orderRoom({ roomId: "r1", orderId: "o1", chatDomain: "trade", domainIdentityKey: "trade:i:s:b" })],
      }).ok
    ).toBe(false);
    expect(
      buildStoreOrderListSnapshot({
        viewerUserId: "cust-1",
        generation: "1",
        rooms: [
          orderRoom({ roomId: "r1", orderId: "o1" }),
          orderRoom({ roomId: "r2", orderId: "o1" }),
        ],
      }).ok
    ).toBe(false);
  });

  it("hub delivers StoreOrderHubViewModel only; inbox rejects store_order", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        orderRoom({
          roomId: "r1",
          orderId: "o1",
          unreadCount: 1,
          latestChatMessageText: "최신",
          latestChatMessageAt: "2026-07-14T13:00:00.000Z",
        }),
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const hub = buildStoreOrderHubViewModel(listed.snapshot.rows);
    expect(hub.hrefToOrderList).toBe(STORE_ORDER_LIST_HREF);
    expect(hub.previewText).toBe("최신");
    expect(hub.unreadCount).toBe(1);
    expect(() => assertHomeInboxRejectsStoreOrderDomain()).toThrow(/forbids_domain/);
  });
});

describe("Phase 4 store_order dual surface / preview / badge / notif", () => {
  it("customer shows store; owner shows customer; pipelines reject foreign fields", () => {
    const c = resolveStoreOrderCustomerPresentation({
      roomId: "r1",
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: "store_order:o1",
      storeName: "맛있는집",
      storeImageUrl: "https://cdn/store.png",
    });
    expect(c.surface.kind).toBe("buyer_store");
    expect(c.display.title).toBe("맛있는집");
    const o = resolveStoreOrderOwnerPresentation({
      roomId: "r1",
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: "store_order:o1",
      customerName: "고객A",
      customerAvatarUrl: "https://cdn/u.png",
    });
    expect(o.surface.kind).toBe("owner_buyer_peer");
    expect(o.display.title).toBe("고객A");
  });

  it("headers and row models stay role-specific; status separated from preview", () => {
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [orderRoom({ roomId: "r1", orderId: "o1", orderStatusLabel: "준비중", latestChatMessageText: "hi" })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const item = listed.snapshot.rows[0]!;
    expect(buildStoreOrderCustomerHeaderModel(item).kind).toBe("buyer_store");
    expect(buildStoreOrderOwnerHeaderModel(item).kind).toBe("owner_buyer_peer");
    expect(buildStoreOrderCustomerListViewModel(item).storeName).toBe("맛있는집");
    expect(buildStoreOrderOwnerListViewModel(item).customerName).toBe("고객A");
    expect(storeOrderStatusBadgeSeparated(item)).toBe("준비중");
    expect(buildStoreOrderCustomerListViewModel(item).previewText).toBe("hi");
  });

  it("preview port rejects metadata mix; badge nav_messenger=0; notification independent", () => {
    expect(
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "주문 왔습니다", messageType: "text" },
      }).text
    ).toBe("주문 왔습니다");
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "x", messageType: "text" },
        lastMessage: "혼용",
      })
    ).toThrow(/metadata_forbidden/);
    const listed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [orderRoom({ roomId: "r1", orderId: "o1", unreadCount: 3 })],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const badge = buildStoreOrderBadgeContribution(listed.snapshot.rows);
    expect(badge.navMessengerContribution).toBe(0);
    expect(countStoreOrderUnreadRooms(listed.snapshot.rows)).toBe(1);
    expect(
      resolveStoreOrderNotificationDisplay({
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        roomId: "r1",
        eventId: "e1",
        viewerRole: "customer",
        storeName: "맛있는집",
        storeImageUrl: null,
        customerName: null,
        customerAvatarUrl: null,
        messagePreview: "hi",
      }).title
    ).toBe("맛있는집");
    expect(() =>
      resolveStoreOrderNotificationDisplay({
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        roomId: "r1",
        eventId: "e1",
        viewerRole: "customer",
        storeName: "맛있는집",
        storeImageUrl: null,
        customerName: null,
        customerAvatarUrl: null,
        messagePreview: "hi",
        directKey: "x",
      })
    ).toThrow(/reinference/);
    expect(resolveStoreOrderSoundKey().eventKey).toBe(STORE_ORDER_SOUND_EVENT_KEY);
  });

  it("cache / bootstrap / read / permission stay store_order-scoped", () => {
    const key = buildStoreOrderCacheKey({ viewerUserId: "u1", generation: "2" });
    expect(key.startsWith("chat.store_order.")).toBe(true);
    const cache = new StoreOrderReadonlyMemoryCache();
    expect(() => cache.writeForbidden()).toThrow(/write_forbidden/);
    expect(() => cache.read("chat.trade.x")).toThrow(/namespace_forbidden/);
    const full = acceptStoreOrderBootstrap({
      viewerUserId: "cust-1",
      generation: "1",
      mode: "full",
      rooms: [orderRoom({ roomId: "r1", orderId: "o1" })],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const merged = mergeStoreOrderPartialBootstrap(full.snapshot, {
      generation: "3",
      rooms: [orderRoom({ roomId: "r2", orderId: "o2" })],
    });
    expect(merged.ok).toBe(true);
    expect(() =>
      assertStoreOrderReadAllowed({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
      })
    ).toThrow(/read_rejects/);
    expect(
      buildStoreOrderMarkReadPayload({
        roomId: "r1",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
      }).clearBadgeTargets
    ).toEqual(["store_order"]);
    expect(() =>
      assertStoreOrderViewerPermission({
        viewerUserId: "stranger",
        room: {
          roomId: "r1",
          chatDomain: STORE_ORDER_DOMAIN,
          domainIdentityKey: "store_order:o1",
          orderId: "o1",
          customerUserId: "cust-1",
          storeOwnerUserIds: ["owner-1"],
          participantUserIds: ["cust-1", "owner-1"],
        },
      })
    ).toThrow(/not_participant|not_order_party/);
  });
});
