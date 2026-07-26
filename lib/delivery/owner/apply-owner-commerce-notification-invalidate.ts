/**
 * Owner commerce notification → Owner order-list cache only.
 * Requires explicit storeId. Never clears all Owner stores or Customer caches.
 */
import { invalidateOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

export type OwnerCommerceNotificationInvalidateInput = {
  ownerUserId: string;
  storeId?: string | null;
  meta?: Record<string, unknown> | null;
  route: string;
  reason: string;
  orderId?: string | null;
};

export function resolveOwnerCommerceNotificationStoreId(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const sid = String(meta.store_id ?? "").trim();
  return sid || null;
}

/**
 * Returns whether an Owner list invalidate ran.
 * Missing storeId → no Delivery cache invalidate (Bell/unread path stays separate).
 */
export function applyOwnerCommerceNotificationInvalidate(
  input: OwnerCommerceNotificationInvalidateInput
): boolean {
  if (!isOwnerStoreCommerceNotificationRow({ meta: input.meta ?? undefined })) return false;

  const storeId = (input.storeId?.trim() || resolveOwnerCommerceNotificationStoreId(input.meta)) ?? "";
  if (!storeId) return false;

  const ownerUserId = input.ownerUserId.trim() || undefined;
  invalidateOwnerStoreOrdersListCache(storeId, ownerUserId, {
    route: input.route,
    reason: input.reason,
    orderId: input.orderId?.trim() || undefined,
  });
  return true;
}
