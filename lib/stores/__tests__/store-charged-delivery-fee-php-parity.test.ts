import { describe, expect, it } from "vitest";
import { resolveChargedDeliveryFeePhp } from "@/lib/stores/store-commerce-extras";

/**
 * CUT-2 — JS side of delivery fee SSOT must stay aligned with
 * public.store_charged_delivery_fee_php (SQL helper).
 */
describe("CUT-2 store delivery fee money authority parity (JS)", () => {
  it("self fee charged", () => {
    expect(
      resolveChargedDeliveryFeePhp(
        { deliveryFeePhp: 50, freeDeliveryOverPhp: null, deliveryFeeMode: "self" },
        100,
        "local_delivery"
      )
    ).toBe(50);
  });

  it("free over threshold", () => {
    expect(
      resolveChargedDeliveryFeePhp(
        { deliveryFeePhp: 50, freeDeliveryOverPhp: 200, deliveryFeeMode: "self" },
        200,
        "local_delivery"
      )
    ).toBe(0);
  });

  it("courier and pickup are 0", () => {
    expect(
      resolveChargedDeliveryFeePhp(
        { deliveryFeePhp: 50, freeDeliveryOverPhp: null, deliveryFeeMode: "courier" },
        100,
        "local_delivery"
      )
    ).toBe(0);
    expect(
      resolveChargedDeliveryFeePhp(
        { deliveryFeePhp: 50, freeDeliveryOverPhp: null, deliveryFeeMode: "self" },
        100,
        "pickup"
      )
    ).toBe(0);
  });

  it("self_free_promo is 0", () => {
    expect(
      resolveChargedDeliveryFeePhp(
        { deliveryFeePhp: null, freeDeliveryOverPhp: null, deliveryFeeMode: "self_free_promo" },
        100,
        "local_delivery"
      )
    ).toBe(0);
  });
});
