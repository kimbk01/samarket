/**
 * R3 — Admin Delivery Ads UX recovery (presentation only).
 * Actionable-first hub · human labels · NULL≠₱0 · performance lifecycle gate.
 * Does not mutate funding gate, prices, packages, Partner, Owner R1, or resolvers.
 */

import {
  DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT,
  DELIVERY_AD_PACKAGE_SEED_CODES,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS,
  formatDeliveryAdPhpMinor,
  isDeliveryAdCommercialPlacementKey,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import {
  inventorySeedByKey,
  type DeliveryAdInventoryKey,
  DELIVERY_AD_INVENTORY_KEYS,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import { deliveryAdPlacementI18nKey } from "@/lib/stores/advertising/delivery-ad-placement-language";
import { mapAdminDeliveryAdActionQueuePresentation } from "@/lib/stores/advertising/delivery-ad-admin-action-queue-presentation";
import { storeSponsoredRequiresBannerCreative } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { AdminDeliveryAdListBucket } from "@/lib/stores/advertising/admin-delivery-ad-contract";

/** Hub default — never "all" (ended would dominate). */
export const ADMIN_DELIVERY_ADS_HUB_DEFAULT_VIEW = "actionable" as const;

export const ADMIN_DELIVERY_ADS_HUB_VIEWS = [
  "actionable",
  "active",
  "scheduled",
  "held",
  "history",
  "all",
] as const;
export type AdminDeliveryAdsHubView = (typeof ADMIN_DELIVERY_ADS_HUB_VIEWS)[number];

/** Campaign list buckets that count as 처리 필요 (client list filter). */
export const ADMIN_DELIVERY_ADS_ACTIONABLE_LIST_BUCKETS = [
  "needs_creative",
  "review",
] as const satisfies ReadonlyArray<Exclude<AdminDeliveryAdListBucket, "all">>;

/** Demoted History tab. */
export const ADMIN_DELIVERY_ADS_HISTORY_LIST_BUCKETS = [
  "ended",
  "rejected",
] as const satisfies ReadonlyArray<Exclude<AdminDeliveryAdListBucket, "all">>;

/** Detail performance panel — ACTIVE / ENDED only. */
export const ADMIN_DELIVERY_ADS_PERFORMANCE_LIFECYCLES = ["ACTIVE", "ENDED"] as const;

/**
 * Commercial matrix cells from launch-sellable inventories × seed durations.
 * store_sponsored: HOME_FEED + CATEGORY_FEED (=2) × 3 = 6
 * banner: HOME_HERO only (=1) × 3 = 3  (SEARCH_TOP NOT_SELLABLE)
 * Total = 9
 */
export const R3_COMMERCIAL_MATRIX_PRODUCTS = ["store_sponsored", "banner"] as const;
export const R3_COMMERCIAL_MATRIX_DURATIONS = [7, 15, 30] as const;
export const R3_COMMERCIAL_MATRIX_SEED_CODES = DELIVERY_AD_PACKAGE_SEED_CODES;
export const R3_COMMERCIAL_MATRIX_EXPECTED_CELLS = 9 as const;

/**
 * R3 locked Admin first-party create. R4 flips this off and enables Banner-only create.
 * Store Promotion first-party remains NOT_IMPLEMENTED_MODEL_BLOCKED.
 */
export const R3_ADMIN_NO_FIRST_PARTY_CREATE = false as const;
/** Partner is a membership product, not a campaign product matrix cell. */
export const R3_ADMIN_PARTNER_NOT_PRODUCT = true as const;
/** R4 — Admin may create DIBAY_FIRST_PARTY Banner (no fake Owner). */
export const R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED = true as const;
/** R4 — Partner membership apply/Admin manage enabled (payment still NOT_IMPLEMENTED). */
export const R4_PARTNER_MEMBERSHIP_PRODUCT_ENABLED = true as const;
/** Store Promotion (`store_sponsored`) first-party create — model blocked in R4. */
export const R4_STORE_PROMOTION_FIRST_PARTY = {
  status: "NOT_IMPLEMENTED_MODEL_BLOCKED",
  reason: "store_sponsored is store-bound Owner-paid only; Banner first-party only in R4",
} as const;

export type AdminDeliveryAdCampaignSourceLabelKey =
  | "admin_delivery_ads_source_owner_paid"
  | "admin_delivery_ads_source_dibay_first_party";

export function adminDeliveryAdCampaignSourceLabelKey(
  source: "OWNER_PAID" | "DIBAY_FIRST_PARTY" | string | null | undefined
): AdminDeliveryAdCampaignSourceLabelKey {
  return source === "DIBAY_FIRST_PARTY"
    ? "admin_delivery_ads_source_dibay_first_party"
    : "admin_delivery_ads_source_owner_paid";
}

export function adminDeliveryAdCampaignSourceHumanLabel(
  source: "OWNER_PAID" | "DIBAY_FIRST_PARTY" | string | null | undefined,
  lang: "ko" | "en"
): string {
  if (source === "DIBAY_FIRST_PARTY") {
    return lang === "en" ? "DIBAY ad" : "디바이 광고";
  }
  return lang === "en" ? "Advertiser ad" : "광고주 광고";
}

export type AdminDeliveryAdProductLabelKey =
  | "admin_delivery_ads_product_store_sponsored"
  | "admin_delivery_ads_product_banner";

export function adminDeliveryAdProductLabelKey(
  product: DeliveryAdProductKind | "store_sponsored" | "banner"
): AdminDeliveryAdProductLabelKey {
  return product === "banner"
    ? "admin_delivery_ads_product_banner"
    : "admin_delivery_ads_product_store_sponsored";
}

/** Human product copy (ko/en) — wraps commercial naming. */
export function adminDeliveryAdProductHumanLabel(
  product: DeliveryAdProductKind | "store_sponsored" | "banner",
  lang: "ko" | "en"
): string {
  if (product === "banner") {
    return lang === "en" ? "Banner ad" : "배너 광고";
  }
  return lang === "en" ? "Store promotion" : "매장 홍보";
}

/** Inventory / placement human label (commercial placement map + fallback). */
export function adminDeliveryAdInventoryHumanLabel(
  inventoryKey: string,
  lang: "ko" | "en"
): string {
  if (isDeliveryAdCommercialPlacementKey(inventoryKey)) {
    return DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS[inventoryKey][lang];
  }
  return inventoryKey;
}

/** i18n key for placement (existing deliveryAdPlacementI18nKey pattern). */
export function adminDeliveryAdInventoryI18nKey(inventoryKey: string) {
  return deliveryAdPlacementI18nKey(inventoryKey);
}

/** Aspect ratio label from inventory SSOT (e.g. "39:16", "3:1"). */
export function adminDeliveryAdInventoryAspectLabel(inventoryKey: string): string | null {
  if (!(DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(inventoryKey)) {
    return null;
  }
  const seed = inventorySeedByKey(inventoryKey as DeliveryAdInventoryKey);
  return `${seed.aspectRatioWidth}:${seed.aspectRatioHeight}`;
}

/**
 * NULL price → "미설정" / "Not set". Never renders ₱0 for null.
 * Integer 0 still formats as ₱0.00 (configured zero, rare).
 */
export function formatAdminDeliveryAdPriceOrUnset(
  amountMinor: number | null | undefined,
  lang: "ko" | "en" = "ko"
): string {
  if (amountMinor == null || !Number.isInteger(amountMinor)) {
    return lang === "en" ? "Not set" : "미설정";
  }
  return formatDeliveryAdPhpMinor(amountMinor);
}

export function isAdminDeliveryAdPriceUnset(
  amountMinor: number | null | undefined
): boolean {
  return amountMinor == null || !Number.isInteger(amountMinor);
}

/** Hub list: whether a campaign row belongs in the current presentation view. */
export function isAdminDeliveryAdHubListItemVisible(input: {
  view: AdminDeliveryAdsHubView;
  listBucket: Exclude<AdminDeliveryAdListBucket, "all"> | null;
}): boolean {
  const b = input.listBucket;
  if (input.view === "all") return true;
  if (input.view === "actionable") {
    return (
      b === "needs_creative" ||
      b === "review" ||
      (ADMIN_DELIVERY_ADS_ACTIONABLE_LIST_BUCKETS as readonly string[]).includes(String(b))
    );
  }
  if (input.view === "history") {
    return b === "ended" || b === "rejected";
  }
  return b === input.view;
}

/** API bucket for fetch — actionable/history use "all" then client-filter. */
export function adminDeliveryAdsHubApiBucket(
  view: AdminDeliveryAdsHubView
): AdminDeliveryAdListBucket {
  if (view === "actionable" || view === "history") return "all";
  return view;
}

export function isAdminDeliveryAdPerformanceLifecycle(
  lifecycleStatus: string | null | undefined
): boolean {
  const s = String(lifecycleStatus ?? "").trim();
  return (
    ADMIN_DELIVERY_ADS_PERFORMANCE_LIFECYCLES as readonly string[]
  ).includes(s);
}

/** Funding status → human i18n key (never raw machine codes like snapshot_missing). */
export function adminDeliveryAdFundingStatusLabelKey(
  status: string | null | undefined
):
  | "admin_delivery_ads_funding_unfunded"
  | "admin_delivery_ads_funding_funded"
  | "admin_delivery_ads_funding_refunded" {
  const s = String(status ?? "").trim().toUpperCase();
  if (s === "FUNDED") return "admin_delivery_ads_funding_funded";
  if (s === "REFUNDED") return "admin_delivery_ads_funding_refunded";
  return "admin_delivery_ads_funding_unfunded";
}

/** Map funding/snapshot machine codes away from UI (Admin-safe). */
export function adminDeliveryAdFundingErrorHumanKey(
  code: string | null | undefined
):
  | "admin_delivery_ads_funding_err_snapshot"
  | "admin_delivery_ads_funding_err_generic"
  | "admin_delivery_ad_funding_required" {
  const c = String(code ?? "").trim();
  if (
    c === "snapshot_missing" ||
    c === "snapshot_not_priced" ||
    c === "invalid_payable"
  ) {
    return "admin_delivery_ads_funding_err_snapshot";
  }
  if (c === "funding_required" || c === "insufficient_balance") {
    return "admin_delivery_ad_funding_required";
  }
  return "admin_delivery_ads_funding_err_generic";
}

export type AdminDeliveryAdHubRowCta = {
  labelKey:
    | "admin_delivery_ads_aq_cta_review"
    | "admin_delivery_ads_aq_cta_produce_banner"
    | "admin_delivery_ads_aq_cta_re_review"
    | "admin_delivery_ads_hub_cta_open";
  href: string;
  focus: "creative" | "operations" | null;
};

/** One primary CTA per hub campaign row. */
export function adminDeliveryAdHubRowPrimaryCta(input: {
  campaignId: string;
  productKind: DeliveryAdProductKind;
  lifecycleStatus: string | null | undefined;
  listBucket: Exclude<AdminDeliveryAdListBucket, "all"> | null;
  creativeAssetPath?: string | null;
  hadChangesRequested?: boolean;
}): AdminDeliveryAdHubRowCta {
  const detailBase = `${DELIVERY_AD_ADMIN_ROUTES.detail(input.campaignId)}?product=${encodeURIComponent(input.productKind)}`;
  const actionable =
    input.listBucket === "needs_creative" ||
    input.listBucket === "review" ||
    input.lifecycleStatus === "SUBMITTED" ||
    input.lifecycleStatus === "UNDER_REVIEW";

  if (actionable) {
    const presentation = mapAdminDeliveryAdActionQueuePresentation({
      productKind: input.productKind,
      lifecycleStatus: input.lifecycleStatus,
      creativeAssetPath: input.creativeAssetPath,
      hadChangesRequested: input.hadChangesRequested,
    });
    const focus = presentation.cta === "produce_banner" ? "creative" : "operations";
    return {
      labelKey: presentation.ctaLabelKey,
      href: `${detailBase}&focus=${focus}`,
      focus,
    };
  }

  return {
    labelKey: "admin_delivery_ads_hub_cta_open",
    href: detailBase,
    focus: null,
  };
}

/** Store Promotion never requires banner creative production. */
export function adminDeliveryAdStoreSponsoredNeedsCreative(): false {
  return storeSponsoredRequiresBannerCreative();
}

/** Matrix axis helpers for commercial settings presentation. */
export function r3CommercialMatrixPlacementsForProduct(
  product: (typeof R3_COMMERCIAL_MATRIX_PRODUCTS)[number]
): readonly string[] {
  return DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[product];
}

export function r3CommercialMatrixExpectedCellCount(): number {
  let n = 0;
  for (const product of R3_COMMERCIAL_MATRIX_PRODUCTS) {
    n +=
      r3CommercialMatrixPlacementsForProduct(product).length *
      R3_COMMERCIAL_MATRIX_DURATIONS.length;
  }
  return n;
}

void R3_ADMIN_NO_FIRST_PARTY_CREATE;
void R3_ADMIN_PARTNER_NOT_PRODUCT;
void R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED;
void R4_PARTNER_MEMBERSHIP_PRODUCT_ENABLED;
void R4_STORE_PROMOTION_FIRST_PARTY;
void R3_COMMERCIAL_MATRIX_EXPECTED_CELLS;
