/**
 * Pull-to-refresh — eligibility map (FEATURE PRESERVATION).
 * Do not invent fetch/API. Wire only existing safe refresh authorities.
 *
 * ELIGIBLE (existing gesture/store already present):
 * - community feed — philife PTR hosts
 * - trade market — TradeMarketPullRefresh*
 * - stores home — useStoresHomePullRefresh / stores-home-pull-refresh-store
 * - stores browse — StoresBrowsePullRefresh*
 * - messenger home — MessengerPullRefresh* / runMessengerHomePullRefresh
 *
 * HOLD (no proven safe refresh authority — no invented router.refresh/API):
 * - most mypage descendants
 * - read-only static/legal pages without existing reload handler
 * - immersive call / map / chat room (layout exceptions)
 *
 * Common UX direction: top pull → indicator → threshold → existing handler → reset.
 * Header/Secondary geometry must not deform during pull.
 */

export const DIBAY_PTR_ELIGIBLE_FAMILIES = [
  "community",
  "trade",
  "stores_home",
  "stores_browse",
  "messenger",
] as const;

export type DibayPtrEligibleFamily = (typeof DIBAY_PTR_ELIGIBLE_FAMILIES)[number];

export const DIBAY_PTR_HOLD_REASON =
  "REFRESH AUTHORITY MISSING — do not invent fetch or unsafe router.refresh" as const;
