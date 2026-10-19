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

/**
 * LNK-3 — 매장 코인(포인트) 거래: 재무 거래 화면을 wallet·storeId 로 필터.
 * 재무 화면 필터 파서(`parseFinanceFilters`)는 `storeId` 를 읽는다 (`store_id` 는 무시됨).
 */
export function businessCcPointsHref(storeId: string): string {
  return `/admin/finance/transactions?wallet=COIN&storeId=${encodeURIComponent(storeId.trim())}`;
}

/** 매장 캐시 거래 — 재무 거래 화면 wallet=CASH + storeId 필터. */
export function businessCcCashTransactionsHref(storeId: string): string {
  return `/admin/finance/transactions?wallet=CASH&storeId=${encodeURIComponent(storeId.trim())}`;
}

/** LNK-1 — 매장 광고: 통합 광고 화면을 store_id 로 필터. */
export function businessCcAdvertisingHref(storeId: string): string {
  return `/admin/advertising?store_id=${encodeURIComponent(storeId.trim())}`;
}

/** LNK-2 — 매장 문의 목록 (store_id 필터). */
export function businessCcInquiriesHref(storeId: string): string {
  return `/admin/store-inquiries?store_id=${encodeURIComponent(storeId.trim())}`;
}

/** CUT E — Store ops hub cross-links (canonical screens only). */
export function businessCcFinanceHref(storeId: string): string {
  return `/admin/finance?storeId=${encodeURIComponent(storeId.trim())}`;
}

/**
 * ARO-OPS-UX-002-B3 — Store Financial Statement workspace.
 * `businessCcFinanceHref` 와 같은 화면 — 매장 허브에서는 「매장 재무」 링크 하나만 노출한다.
 */
export function businessCcFinancialStatementHref(storeId: string): string {
  return `/admin/finance?storeId=${encodeURIComponent(storeId.trim())}`;
}

export function businessCcCashChargesHref(): string {
  return "/admin/delivery-ads/cash-charges";
}

/** 배달 광고 처리 대기열(재무 명세 등 기존 호출부 유지). 매장 허브는 `businessCcAdvertisingHref` 사용. */
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
