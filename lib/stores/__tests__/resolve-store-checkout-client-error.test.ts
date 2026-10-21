import { describe, expect, it } from "vitest";
import { resolveStoreCheckoutClientError } from "@/lib/stores/resolve-store-checkout-client-error";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("resolveStoreCheckoutClientError — delivery address codes", () => {
  it("maps V2 unresolved member LGU to a distinct copy (not coords)", () => {
    expect(resolveStoreCheckoutClientError(t, "delivery_customer_lgu_unresolved")).toBe(
      "store_err_delivery_customer_lgu_unresolved"
    );
    expect(resolveStoreCheckoutClientError(t, "delivery_customer_coords_required")).toBe(
      "store_err_delivery_customer_coords_required"
    );
  });

  it("maps master / invalid delivery address codes", () => {
    expect(resolveStoreCheckoutClientError(t, "delivery_user_address_not_master")).toBe(
      "store_err_delivery_user_address_not_master"
    );
    expect(resolveStoreCheckoutClientError(t, "delivery_user_address_invalid")).toBe(
      "store_err_delivery_user_address_invalid"
    );
  });

  it("unknown codes keep the generic fallback", () => {
    expect(resolveStoreCheckoutClientError(t, "nope")).toBe('store_err_order_failed:{"code":"nope"}');
  });
});
