/**
 * CUT 7 — Cart behavior when Delivery master address changes.
 *
 * PRODUCT POLICY (evidence-locked):
 * RETAIN_AND_REVALIDATE
 *
 * Evidence:
 * - Cart lines live in StoreCommerceCartContext + localStorage
 *   (`kasama_store_commerce_cart_v1`) — storeId + lines only (no address authority).
 * - `samarket:addresses-updated` on cart page reloads checkout identity +
 *   re-fetches delivery-serviceability; does NOT call clearStoreCart.
 * - clearStoreCart is user-confirm / conflict / logout / order-complete only.
 * - Order create remains CUT 6 MASTER_ONLY + current serviceability.
 *
 * DO NOT: invent CLEAR_ON_ADDRESS_CHANGE without a new product decision.
 */

export const CART_ADDRESS_CHANGE_POLICY = "RETAIN_AND_REVALIDATE" as const;

export type CartAddressChangePolicy = typeof CART_ADDRESS_CHANGE_POLICY;

/** Cart persistence must not store delivery destination authority. */
export function cartSnapshotHoldsDeliveryAddressAuthority(snapshotSource: string): boolean {
  return /user_address_id|delivery_latitude|delivery_longitude|addressId/.test(snapshotSource);
}
