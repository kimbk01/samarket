import { beforeEach, describe, expect, it, vi } from "vitest";

const invalidateOwnerStoreOrdersListCache = vi.fn();

vi.mock("@/lib/delivery/owner/owner-store-orders-list-cache", () => ({
  invalidateOwnerStoreOrdersListCache: (...args: unknown[]) =>
    invalidateOwnerStoreOrdersListCache(...args),
}));

describe("applyOwnerCommerceNotificationInvalidate", () => {
  beforeEach(() => {
    vi.resetModules();
    invalidateOwnerStoreOrdersListCache.mockReset();
  });

  it("invalidates only the matching Owner store", async () => {
    const { applyOwnerCommerceNotificationInvalidate } = await import(
      "@/lib/delivery/owner/apply-owner-commerce-notification-invalidate"
    );
    const ran = applyOwnerCommerceNotificationInvalidate({
      ownerUserId: "owner-1",
      storeId: "store-1",
      meta: { kind: "store_order_created", store_id: "store-1" },
      route: "test",
      reason: "unit",
    });
    expect(ran).toBe(true);
    expect(invalidateOwnerStoreOrdersListCache).toHaveBeenCalledWith(
      "store-1",
      "owner-1",
      expect.objectContaining({ route: "test", reason: "unit" })
    );
  });

  it("does not invalidate Owner caches when storeId is missing", async () => {
    const { applyOwnerCommerceNotificationInvalidate } = await import(
      "@/lib/delivery/owner/apply-owner-commerce-notification-invalidate"
    );
    const ran = applyOwnerCommerceNotificationInvalidate({
      ownerUserId: "owner-1",
      meta: { kind: "store_order_created" },
      route: "test",
      reason: "missing_store",
    });
    expect(ran).toBe(false);
    expect(invalidateOwnerStoreOrdersListCache).not.toHaveBeenCalled();
  });

  it("ignores Customer commerce notifications", async () => {
    const { applyOwnerCommerceNotificationInvalidate } = await import(
      "@/lib/delivery/owner/apply-owner-commerce-notification-invalidate"
    );
    const ran = applyOwnerCommerceNotificationInvalidate({
      ownerUserId: "buyer-1",
      storeId: "store-1",
      meta: { kind: "store_order_owner_status", store_id: "store-1" },
      route: "test",
      reason: "buyer",
    });
    expect(ran).toBe(false);
    expect(invalidateOwnerStoreOrdersListCache).not.toHaveBeenCalled();
  });
});
