import { describe, expect, it } from "vitest";
import {
  deliveryCustomerOrderDetailCacheKey,
  deliveryCustomerOrderEventsCacheKey,
  deliveryCustomerOrdersListCacheKey,
  deliveryOwnerOrderDetailCacheKey,
  deliveryOwnerOrdersListCacheKey,
} from "@/lib/delivery/shared/contracts/delivery-order-cache-namespace";

describe("delivery order cache namespaces", () => {
  it("separates Customer and Owner keys for the same order", () => {
    const customer = deliveryCustomerOrderDetailCacheKey("order-1");
    const owner = deliveryOwnerOrderDetailCacheKey("store-1", "order-1");
    expect(customer).toBe("delivery-customer:order:order-1");
    expect(owner).toBe("delivery-owner:order:store-1:order-1");
    expect(customer).not.toBe(owner);
  });

  it("separates detail, events, and role list slots", () => {
    expect(deliveryCustomerOrderEventsCacheKey("order-1")).toBe(
      "delivery-customer:order-events:order-1"
    );
    expect(deliveryCustomerOrdersListCacheKey("viewer-1")).toBe(
      "delivery-customer:orders:viewer-1"
    );
    expect(deliveryOwnerOrdersListCacheKey("store-1", "owner-1")).toBe(
      "delivery-owner:orders:store-1:owner-1"
    );
  });
});
