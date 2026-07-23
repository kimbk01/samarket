/**
 * Order-summary marker in latest message must redact at row level —
 * mixed rooms must still compose (no whole-list kill).
 */
import { describe, expect, it } from "vitest";
import {
  STORE_ORDER_DOMAIN,
  STORE_ORDER_SUMMARY_REDACTED_PREVIEW,
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderHubViewModel,
  resolveStoreOrderPreview,
  type StoreOrderListItem,
} from "@/lib/messenger/store-order";
import {
  validateDomainReadStoreOrderCustomerListDto,
} from "@/lib/messenger/contracts/domain-read-store-order-customer-list-compose";
import { resetDomainReadBundleKillsForTests } from "@/lib/messenger/contracts/domain-read-surface-canary";

function row(
  partial: Partial<StoreOrderListItem> & {
    roomId: string;
    orderId: string;
    latestChatMessageText: string | null;
  }
): StoreOrderListItem {
  return {
    roomId: partial.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId ?? "store-1",
    storeName: partial.storeName ?? "맛있는집",
    storeImageUrl: null,
    customerUserId: "buyer-1",
    customerName: "Buyer",
    customerAvatarUrl: null,
    latestChatMessageText: partial.latestChatMessageText,
    latestChatMessageAt: partial.latestChatMessageAt ?? "2026-07-22T00:00:00.000Z",
    latestChatMessageType: partial.latestChatMessageType ?? "text",
    unreadCount: partial.unreadCount ?? 0,
    orderStatusLabel: partial.orderStatusLabel ?? "completed",
    fulfillmentType: partial.fulfillmentType ?? null,
    generation: "test",
  };
}

describe("store-order preview summary marker — row-level redact", () => {
  it("redacts summary template without throwing", () => {
    const preview = resolveStoreOrderPreview({
      chatDomain: STORE_ORDER_DOMAIN,
      latestChatMessage: {
        text: "📋 주문 요약\n매장: X\n주문번호: SO1\n합계: ₱100",
        messageType: "text",
      },
    });
    expect(preview.text).toBe(STORE_ORDER_SUMMARY_REDACTED_PREVIEW);
    expect(preview.text).not.toMatch(/주문 요약|주문번호/);
  });

  it("keeps normal message preview", () => {
    expect(
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "도착했어요", messageType: "text" },
      }).text
    ).toBe("도착했어요");
  });

  it("mixed rooms: summary + normal both produce list VMs", () => {
    const summary = row({
      roomId: "r-summary",
      orderId: "o-summary",
      latestChatMessageText: "📋 주문 요약\n주문번호: SO9",
      latestChatMessageAt: "2026-07-22T01:00:00.000Z",
    });
    const normal = row({
      roomId: "r-normal",
      orderId: "o-normal",
      latestChatMessageText: "네 알겠습니다",
      latestChatMessageAt: "2026-07-22T02:00:00.000Z",
    });
    const vmSummary = buildStoreOrderCustomerListViewModel(summary);
    const vmNormal = buildStoreOrderCustomerListViewModel(normal);
    expect(vmSummary.previewText).toBe(STORE_ORDER_SUMMARY_REDACTED_PREVIEW);
    expect(vmNormal.previewText).toBe("네 알겠습니다");
    const hub = buildStoreOrderHubViewModel([summary, normal]);
    expect(hub.roomCount).toBe(2);
    expect(hub.latestRoomId).toBe("r-normal");
    expect(hub.previewText).toBe("네 알겠습니다");
  });

  it("other hard failures still throw (bare status)", () => {
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: STORE_ORDER_DOMAIN,
        latestChatMessage: { text: "배달중", messageType: "text" },
      })
    ).toThrow(/status_text_forbidden/);
  });
});

describe("store-order customer list compose — summary rows do not kill bundle", () => {
  it("unit path: DTO validate accepts redacted preview rows", () => {
    resetDomainReadBundleKillsForTests();
    const rows = [
      {
        roomId: "r1",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o1",
        orderId: "o1",
        storeId: "s1",
        storeName: "Store",
        storeImageUrl: null as string | null,
        previewText: STORE_ORDER_SUMMARY_REDACTED_PREVIEW,
        statusBadge: "completed" as string | null,
        unreadCount: 0,
        lastMessageAt: "2026-07-22T02:00:00.000Z",
        href: "/community-messenger/r/r1",
        exposesMemberIdentity: false as const,
      },
      {
        roomId: "r2",
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: "store_order:o2",
        orderId: "o2",
        storeId: "s1",
        storeName: "Store",
        storeImageUrl: null as string | null,
        previewText: "hi",
        statusBadge: null as string | null,
        unreadCount: 1,
        lastMessageAt: "2026-07-22T03:00:00.000Z",
        href: "/community-messenger/r/r2",
        exposesMemberIdentity: false as const,
      },
    ];
    const dto = {
      authority: "domain_store_order_customer_list_canary" as const,
      viewerUserId: "v1",
      producedAt: "2026-07-22T03:00:00.000Z",
      surfaceRole: "customer" as const,
      hub: {
        roomCount: 2,
        unreadRoomCount: 1,
        latestRoomId: "r2",
        latestActivityAt: "2026-07-22T03:00:00.000Z",
        previewText: "hi",
        latestDomainIdentityKey: "store_order:o2",
      },
      rows,
      writers: {
        cache: false as const,
        realtime: false as const,
        badge: false as const,
        notification: false as const,
        atomic: false as const,
      },
    };
    expect(validateDomainReadStoreOrderCustomerListDto(dto)).toEqual({ ok: true });
  });
});
