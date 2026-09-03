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

/** Settlements list — UI seeds filter from store_id (API already filters). */
export function businessCcSettlementsHref(storeId: string): string {
  return `/admin/store-settlements?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcCancellationsHref(storeId: string): string {
  return `/admin/stores/orders/cancellations?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcRefundsHref(storeId: string): string {
  return `/admin/stores/orders/refunds?store_id=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcReportsHref(storeId: string): string {
  return `/admin/store-reports?store_id=${encodeURIComponent(storeId.trim())}`;
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

export function businessCcPointsHref(_query?: string): string {
  return "/admin/store-point-ledger";
}

/** CUT E — Store ops hub cross-links (canonical screens only). */
export function businessCcFinanceHref(storeId: string): string {
  return `/admin/finance?storeId=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcCashChargesHref(): string {
  return "/admin/delivery-ads/cash-charges";
}

export function businessCcDeliveryAdsHref(storeId: string): string {
  return `/admin/delivery-ads?view=actionable&storeId=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcPartnerHref(): string {
  return "/admin/delivery-ads/partner";
}

export function businessCcSupportHref(storeId: string): string {
  return `/admin/support?filter=OWNER&search=${encodeURIComponent(storeId.trim())}`;
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
