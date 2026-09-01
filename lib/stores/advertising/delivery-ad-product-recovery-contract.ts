/**
 * Final Integrated Product Recovery — frozen audit + launch product SSOT.
 * Authority order: CUSTOMER SURFACE → PHYSICAL PLACEMENT → ADMIN POLICY → SELLABLE PRODUCT.
 * DO NOT sell placements customers do not meaningfully use.
 */

export const DELIVERY_AD_PRODUCT_RECOVERY = {
  id: "stage1_store_finance_authority" as const,
  productClosedBaseline: false as const,
  midDeploys: ["55ac2e0d7", "89829c378", "80301671f", "2d90e3278"] as const,
  /** Archived Stage 1 finance values retained for migration-history compatibility only. */
  canonicalAdsDebitSource: "STORE_CASH" as const,
  cashAcquisition: "GIFT_REVENUE_CONVERSION_TO_STORE_CASH" as const,
  creditAdsSpend: false as const,
  creditToCashTransfer: false as const,
  externalTopUp: "NOT_IMPLEMENTED_PRESERVED" as const,
  legacyBusinessCash: "MIGRATION_SOURCE" as const,
  paymentModel: "DEBIT_REFUND" as const,
} as const;

/**
 * SEARCH_TOP: route `/stores/search` exists, but primary discovery is HOME → 1st → 2nd.
 * Launch: NOT_SELLABLE. Schema/runtime consumer may remain for compat.
 */
export const STORES_SEARCH_TOP_LAUNCH = {
  inventoryKey: "STORES_SEARCH_TOP" as const,
  launchStatus: "NOT_SELLABLE" as const,
  keepSchema: true as const,
  keepRuntimeConsumer: true as const,
  reason: "Primary customer discovery is category/browse-driven, not search-results-first",
} as const;

/** Browse target for STORES_CATEGORY_FEED campaigns. */
export const DELIVERY_AD_BROWSE_TARGET_KINDS = ["primary", "secondary"] as const;
export type DeliveryAdBrowseTargetKind = (typeof DELIVERY_AD_BROWSE_TARGET_KINDS)[number];

export function isDeliveryAdBrowseTargetKind(v: unknown): v is DeliveryAdBrowseTargetKind {
  return v === "primary" || v === "secondary";
}

/**
 * Whether a category campaign may insert on this customer browse scope.
 * Legacy null target → allow (compat). Primary → sub=all only. Secondary → matching topic.
 */
export function browseTargetMatchesCustomerScope(input: {
  browseTargetKind: DeliveryAdBrowseTargetKind | null | undefined;
  browsePrimarySlug: string | null | undefined;
  browseSecondarySlug: string | null | undefined;
  customerPrimarySlug: string;
  customerSubSlug: string | null;
}): boolean {
  const kind = input.browseTargetKind ?? null;
  if (!kind) return true;
  const primary = String(input.customerPrimarySlug ?? "")
    .trim()
    .toLowerCase();
  const subRaw = String(input.customerSubSlug ?? "")
    .trim()
    .toLowerCase();
  const sub = !subRaw || subRaw === "all" ? null : subRaw;
  const campPrimary = String(input.browsePrimarySlug ?? "")
    .trim()
    .toLowerCase();
  const campSecondary = String(input.browseSecondarySlug ?? "")
    .trim()
    .toLowerCase();

  if (kind === "primary") {
    if (sub) return false;
    if (campPrimary && campPrimary !== primary) return false;
    return true;
  }
  if (!sub) return false;
  if (campPrimary && campPrimary !== primary) return false;
  if (campSecondary && campSecondary !== sub) return false;
  return true;
}

export const DELIVERY_AD_CASH_CHARGE_REQUEST_STATUSES = [
  "pending_deposit",
  "under_review",
  "completed",
  "rejected",
] as const;
export type DeliveryAdCashChargeRequestStatus =
  (typeof DELIVERY_AD_CASH_CHARGE_REQUEST_STATUSES)[number];

export const DELIVERY_AD_CASH_CHARGE_PRESETS_MAJOR = [500, 1000, 2000, 5000] as const;
export const DELIVERY_AD_CASH_CHARGE_MIN_MAJOR = 100;
export const DELIVERY_AD_CASH_CHARGE_MAX_MAJOR = 100_000;

export function assertDeliveryAdCashChargeAmountMajor(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= DELIVERY_AD_CASH_CHARGE_MIN_MAJOR &&
    n <= DELIVERY_AD_CASH_CHARGE_MAX_MAJOR
  );
}
