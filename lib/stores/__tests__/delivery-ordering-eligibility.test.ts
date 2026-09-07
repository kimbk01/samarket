import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeliveryOrderingBlockedByServiceability } from "@/lib/stores/delivery-ordering-eligibility";
import { isDeliveryDistanceOrderBlocked } from "@/lib/stores/fetch-store-delivery-serviceability-client";
import { CART_ADDRESS_CHANGE_POLICY } from "@/lib/store-commerce/cart-address-change-policy";

describe("CUT 8 store detail / add-to-cart eligibility", () => {
  it("blocks add only for local_delivery + out of range", () => {
    expect(
      isDeliveryOrderingBlockedByServiceability({
        fulfillmentMode: "local_delivery",
        distanceOutOfRange: true,
      }),
    ).toBe(true);
    expect(
      isDeliveryOrderingBlockedByServiceability({
        fulfillmentMode: "pickup",
        distanceOutOfRange: true,
      }),
    ).toBe(false);
    expect(
      isDeliveryOrderingBlockedByServiceability({
        fulfillmentMode: "local_delivery",
        distanceOutOfRange: false,
      }),
    ).toBe(false);
  });

  it("reuses cart/checkout distance block predicate", () => {
    expect(
      isDeliveryDistanceOrderBlocked({
        ok: true,
        applies: true,
        eligible: false,
      }),
    ).toBe(true);
    expect(
      isDeliveryDistanceOrderBlocked({
        ok: true,
        applies: true,
        eligible: true,
      }),
    ).toBe(false);
  });

  it("StoreDetailPublic wires canonical serviceability + add block", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/StoreDetailPublic.tsx"),
      "utf8",
    );
    expect(src).toContain("fetchStoreDeliveryServiceabilityClient");
    expect(src).toContain("isDeliveryOrderingBlockedByServiceability");
    expect(src).toContain("addActionsBlocked={deliveryOrderingBlocked}");
    expect(src).toContain("store_detail_delivery_unavailable");
    expect(src).toContain("SAMARKET_ADDRESSES_UPDATED_EVENT");
    expect(src).toMatch(/ac\?\.abort\(\)/);
  });

  it("menu browse stays open while quick-add hides on addActionsBlocked", () => {
    const card = readFileSync(
      join(process.cwd(), "components/stores/detail/ProductMenuCard.tsx"),
      "utf8",
    );
    expect(card).toContain("addActionsBlocked");
    expect(card).toContain("hideQuickAdd");
    expect(card).toMatch(/if \(onOpenProduct\)/);
  });

  it("StoreProductPublic blocks add with same serviceability", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/StoreProductPublic.tsx"),
      "utf8",
    );
    expect(src).toContain("fetchStoreDeliveryServiceabilityClient");
    expect(src).toContain("isDeliveryOrderingBlockedByServiceability");
    expect(src).toContain("deliveryOrderingBlocked");
    expect(src).toContain("SAMARKET_ADDRESSES_UPDATED_EVENT");
  });

  it("CUT 7 cart retain policy preserved", () => {
    expect(CART_ADDRESS_CHANGE_POLICY).toBe("RETAIN_AND_REVALIDATE");
  });

  it("order create master hard block preserved", () => {
    const orders = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(orders).toContain("delivery_user_address_not_master");
    expect(orders).toContain("evaluateDeliveryServiceability");
  });
});
