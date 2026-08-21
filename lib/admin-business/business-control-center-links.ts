/**
 * Business Control Center → existing Admin surfaces.
 * Only emit deep-links when URL+API filter on stores.id is proven.
 * BUSINESS ROOT ID = stores.id
 */

export function businessCcOrdersByStoreHref(storeId: string): string {
  return `/admin/stores/orders/by-store/${encodeURIComponent(storeId.trim())}`;
}

export function businessCcStoreOrdersHref(storeId: string): string {
  return `/admin/store-orders?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcProductsHref(storeId: string): string {
  return `/admin/store-products?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcReviewsHref(storeId: string): string {
  return `/admin/store-reviews?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcAuditHref(storeId: string): string {
  return `/admin/audit-logs?target_type=store&target_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcEntryReviewHref(storeNameOrSlug?: string): string {
  const q = String(storeNameOrSlug ?? "").trim();
  return q ? `/admin/stores?q=${encodeURIComponent(q)}` : "/admin/stores";
}

export function businessCcFeePoliciesHref(): string {
  return "/admin/store-fee-policies";
}

export function businessCcDeliveryDistanceHref(): string {
  return "/admin/delivery-distance";
}

export function businessCcPointsHref(query?: string): string {
  const q = String(query ?? "").trim();
  return q ? `/admin/store-points?q=${encodeURIComponent(q)}` : "/admin/store-points";
}

export function businessCcOwnerMemberHref(ownerUserId: string): string {
  return `/admin/users/${encodeURIComponent(ownerUserId.trim())}`;
}

export function businessCcPublicStoreHref(slug: string): string {
  return `/stores/${encodeURIComponent(slug.trim())}`;
}

export function businessCcTaxonomyHref(): string {
  return "/admin/stores/application-settings?menu=stores";
}

export function businessCcBackToStoreHref(storeId: string): string {
  return `/admin/business/${encodeURIComponent(storeId.trim())}`;
}
