import { describe, expect, it } from "vitest";
import {
  buildOwnerStoreOrderNotificationHref,
  ownerMobileTabForCommerceMetaKind,
} from "@/lib/business/owner-store-order-notification-href";

const STORE = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";

describe("ownerMobileTabForCommerceMetaKind", () => {
  it("maps owner commerce kinds to mobile tabs", () => {
    expect(ownerMobileTabForCommerceMetaKind("store_order_created")).toBe("new");
    expect(ownerMobileTabForCommerceMetaKind("store_order_accept_reminder_30s")).toBe("new");
    expect(ownerMobileTabForCommerceMetaKind("store_order_refund_requested")).toBe("cancelled");
    expect(ownerMobileTabForCommerceMetaKind("store_order_buyer_cancelled")).toBe("cancelled");
    expect(ownerMobileTabForCommerceMetaKind("store_order_payment_completed")).toBe("new");
  });
});

describe("buildOwnerStoreOrderNotificationHref", () => {
  it("prefers orderStatus over kind for tab", () => {
    const href = buildOwnerStoreOrderNotificationHref({
      storeId: STORE,
      orderId: ORDER,
      kind: "store_order_created",
      orderStatus: "preparing",
      ackOwnerNotifications: true,
    });
    expect(href).toContain(`storeId=${encodeURIComponent(STORE)}`);
    expect(href).toContain(`order_id=${encodeURIComponent(ORDER)}`);
    expect(href).toContain("tab=progress");
    expect(href).toContain("ack_owner_notifications=1");
  });

  it("uses kind when orderStatus absent", () => {
    const href = buildOwnerStoreOrderNotificationHref({
      storeId: STORE,
      orderId: ORDER,
      kind: "store_order_refund_requested",
    });
    expect(href).toContain("tab=cancelled");
    expect(href).not.toContain("ack_owner_notifications");
  });

  it("defaults new-order kind to new tab", () => {
    const href = buildOwnerStoreOrderNotificationHref({
      storeId: STORE,
      orderId: ORDER,
      kind: "store_order_created",
      ackOwnerNotifications: true,
    });
    expect(href).toContain("tab=new");
  });
});
