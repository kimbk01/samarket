import { describe, expect, it, vi } from "vitest";
import { notifyStoreOwnerProductSoldOutFromOrder } from "@/lib/notifications/notify-store-commerce";

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

import { appendUserNotification } from "@/lib/notifications/append-user-notification";

function makeSb() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { preferred_language: "ko" } })),
        })),
      })),
    })),
  };
}

describe("notifyStoreOwnerProductSoldOutFromOrder", () => {
  it("appends commerce store notification with sold-out meta and dedupe", async () => {
    const sb = makeSb() as never;
    await notifyStoreOwnerProductSoldOutFromOrder(sb, {
      storeId: "store-1",
      orderId: "order-1",
      orderNo: "SO123",
      productId: "prod-1",
      productTitle: "Test Menu",
      ownerUserId: "owner-1",
      storeName: "Test Store",
    });

    expect(appendUserNotification).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        user_id: "owner-1",
        notification_type: "commerce",
        domain: "store",
        ref_id: "order-1",
        dedupe_key: "commerce:owner:sold_out:order-1:prod-1",
        meta: expect.objectContaining({
          kind: "store_order_sold_out",
          store_id: "store-1",
          order_id: "order-1",
          order_no: "SO123",
          product_id: "prod-1",
          product_title: "Test Menu",
        }),
      })
    );
  });

  it("skips when owner user id is missing", async () => {
    vi.mocked(appendUserNotification).mockClear();
    const sb = makeSb() as never;
    await notifyStoreOwnerProductSoldOutFromOrder(sb, {
      storeId: "store-1",
      orderId: "order-1",
      orderNo: "SO123",
      productId: "prod-1",
      ownerUserId: "",
    });
    expect(appendUserNotification).not.toHaveBeenCalled();
  });
});
