/**
 * Delivery Customer / Owner cache namespace SSOT.
 *
 * Shared file is pure key construction only. Runtime cache state and writers remain
 * inside each role domain.
 */
export const DELIVERY_CUSTOMER_CACHE_PREFIX = "delivery-customer";
export const DELIVERY_OWNER_CACHE_PREFIX = "delivery-owner";

function clean(value: string): string {
  return value.trim();
}

export function deliveryCustomerOrderDetailCacheKey(orderId: string): string {
  return `${DELIVERY_CUSTOMER_CACHE_PREFIX}:order:${clean(orderId)}`;
}

export function deliveryCustomerOrderEventsCacheKey(orderId: string): string {
  return `${DELIVERY_CUSTOMER_CACHE_PREFIX}:order-events:${clean(orderId)}`;
}

export function deliveryCustomerOrdersListCacheKey(viewerUserId: string): string {
  return `${DELIVERY_CUSTOMER_CACHE_PREFIX}:orders:${clean(viewerUserId)}`;
}

export function deliveryOwnerOrderDetailCacheKey(storeId: string, orderId: string): string {
  return `${DELIVERY_OWNER_CACHE_PREFIX}:order:${clean(storeId)}:${clean(orderId)}`;
}

export function deliveryOwnerOrdersListCacheKey(storeId: string, ownerUserId: string): string {
  return `${DELIVERY_OWNER_CACHE_PREFIX}:orders:${clean(storeId)}:${clean(ownerUserId)}`;
}
