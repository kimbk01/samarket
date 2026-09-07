import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CART_ADDRESS_CHANGE_POLICY,
  cartSnapshotHoldsDeliveryAddressAuthority,
} from "@/lib/store-commerce/cart-address-change-policy";

describe("CUT 7 cart address-change policy", () => {
  it("locks RETAIN_AND_REVALIDATE", () => {
    expect(CART_ADDRESS_CHANGE_POLICY).toBe("RETAIN_AND_REVALIDATE");
  });

  it("cart storage snapshot has no delivery address authority fields", () => {
    const types = readFileSync(
      join(process.cwd(), "lib/stores/store-commerce-cart-types.ts"),
      "utf8",
    );
    expect(cartSnapshotHoldsDeliveryAddressAuthority(types)).toBe(false);
    expect(types).not.toContain("user_address_id");
    expect(types).not.toContain("delivery_latitude");
  });

  it("addresses-updated retains cart and revalidates (no clearStoreCart)", () => {
    const cartPage = readFileSync(
      join(process.cwd(), "components/stores/StoreCommerceCartPageClient.tsx"),
      "utf8",
    );
    expect(cartPage).toContain("SAMARKET_ADDRESSES_UPDATED_EVENT");
    expect(cartPage).toContain("bootstrapCheckoutIdentity");
    expect(cartPage).toContain("fetchStoreDeliveryServiceabilityClient");
    expect(cartPage).toContain("setDeliveryAddressRevalidatedNotice(true)");
    expect(cartPage).toContain("userPickedDeliveryAddressRef.current = false");
    expect(cartPage).toContain("store_err_delivery_out_of_range");
    expect(cartPage).toContain("store_cart_out_of_range_change_address");
    expect(cartPage).toContain("store_cart_out_of_range_clear_cart");
    expect(cartPage).toContain("store_cart_out_of_range_back_store");

    const onAddr = cartPage.slice(
      cartPage.indexOf("const onAddressesUpdated = () => {\n      if (lines.length === 0) return;"),
      cartPage.indexOf("window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);"),
    );
    expect(onAddr).not.toContain("clearStoreCart");
    expect(onAddr).not.toContain("clearAllCarts");
  });

  it("checkout blocked when out of range; clear is confirm-only", () => {
    const cartPage = readFileSync(
      join(process.cwd(), "components/stores/StoreCommerceCartPageClient.tsx"),
      "utf8",
    );
    expect(cartPage).toMatch(/distanceOrderBlocked[\s\S]*checkoutBlocked/);
    expect(cartPage).toContain("StoreCartClearConfirmDialog");
    expect(cartPage).toContain("submitDisabled={!meetsMin || fulfillmentOptions.length === 0 || checkoutBlocked}");
  });

  it("CUT 6 order master-only still present", () => {
    const orders = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(orders).toContain("delivery_user_address_not_master");
    expect(orders).toContain("pickAddressRowForDeliveryRouting");
  });

  it("CUT 5 DeliveryRoutableAddressGate still on stores layout", () => {
    const shell = readFileSync(
      join(process.cwd(), "components/delivery/navigation/StoresDeliveryLayoutShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("DeliveryRoutableAddressGate");
  });
});
