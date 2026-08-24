/**
 * CUT 7 — EDITORIAL_PROMOTION contract (ONE domain).
 *
 * EDITORIAL_PROMOTION ≠ STORE_PAID_AD ≠ BANNER_AD ≠ COUPON ≠ DELIVERY_FEE_BENEFIT
 *
 * Authority table: store_discovery_campaigns (types: event | promo only).
 * HOME membership: editorial_promo / campaignFood via store.discoveryCampaign.
 * BROWSE: decoration max — NO row insertion, NO organic rank override (CUT 3 lock).
 */

import {
  STORE_DISCOVERY_CAMPAIGN_TABLE,
  STORE_DISCOVERY_CAMPAIGN_TYPES,
  compareStoreDiscoveryCampaignsForHome,
  isStoreDiscoveryCampaignActive,
  isStoreDiscoveryCampaignType,
  selectActiveStoreDiscoveryCampaignsForHome,
  type StoreDiscoveryCampaignAuthorityRow,
  type StoreDiscoveryCampaignType,
} from "@/lib/stores/store-discovery-campaign-authority";
import { STORE_DISCOVERY_CAMPAIGNS_MEANING } from "@/lib/stores/discovery-authority/monetization";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";

export const EDITORIAL_PROMOTION_CAMPAIGN_TABLE = STORE_DISCOVERY_CAMPAIGN_TABLE;
export const EDITORIAL_PROMOTION_CAMPAIGN_TYPES = STORE_DISCOVERY_CAMPAIGN_TYPES;
export type EditorialPromotionCampaignType = StoreDiscoveryCampaignType;
export type EditorialPromotionCampaignRow = StoreDiscoveryCampaignAuthorityRow;

/** Product meaning lock — store_discovery_campaigns is editorial only. */
export const EDITORIAL_PROMOTION_MEANING = STORE_DISCOVERY_CAMPAIGNS_MEANING;

/** CUT 7 — BROWSE must not insert editorial as paid-style rows. */
export const EDITORIAL_PROMOTION_BROWSE_INSERTION_ALLOWED = false as const;

/** CUT 7 — BROWSE organic ranking must ignore editorial campaigns. */
export const EDITORIAL_PROMOTION_BROWSE_RANK_OVERRIDE_ALLOWED = false as const;

/** DELIVERY_FEE_BENEFIT evidence field (not a campaign table). */
export const DELIVERY_FEE_BENEFIT_EVIDENCE_FIELD = "deliveryFeeStrikePhp" as const;

export function isEditorialPromotionCampaignActive(
  row: Pick<EditorialPromotionCampaignRow, "isActive" | "startAt" | "endAt">,
  nowMs?: number
): boolean {
  return isStoreDiscoveryCampaignActive({ ...row, nowMs });
}

export function selectEditorialPromotionsForHome(
  rows: readonly EditorialPromotionCampaignRow[],
  candidateStoreIds: readonly string[],
  nowMs?: number
): Map<string, EditorialPromotionCampaignRow> {
  return selectActiveStoreDiscoveryCampaignsForHome(rows, candidateStoreIds, nowMs);
}

export {
  compareStoreDiscoveryCampaignsForHome as compareEditorialPromotionsForHome,
  isStoreDiscoveryCampaignType as isEditorialPromotionCampaignType,
};

/** Domain tables must stay separate — never merge into one campaigns table. */
export const STORES_DISCOVERY_DOMAIN_TABLE_SEPARATION = {
  STORE_PAID_AD: STORE_PAID_AD_CAMPAIGN_TABLE,
  BANNER_AD: STORE_BANNER_AD_CAMPAIGN_TABLE,
  COUPON: STORE_COUPON_CAMPAIGN_TABLE,
  EDITORIAL_PROMOTION: EDITORIAL_PROMOTION_CAMPAIGN_TABLE,
  DELIVERY_FEE_BENEFIT: DELIVERY_FEE_BENEFIT_EVIDENCE_FIELD,
} as const;

export function assertEditorialPromotionDomainSeparation(): boolean {
  const t = STORES_DISCOVERY_DOMAIN_TABLE_SEPARATION;
  // Widen to string so const literal domains remain comparable without TS2367.
  const editorial: string = t.EDITORIAL_PROMOTION;
  const paid: string = t.STORE_PAID_AD;
  const banner: string = t.BANNER_AD;
  const coupon: string = t.COUPON;
  const deliveryFeeBenefit: string = t.DELIVERY_FEE_BENEFIT;
  return (
    editorial !== paid &&
    editorial !== banner &&
    editorial !== coupon &&
    deliveryFeeBenefit !== editorial
  );
}

/** HOME shelf membership: store has attached active editorial campaign payload. */
export function storeHasEditorialPromotionMembership(store: {
  discoveryCampaign?: { id?: string | null } | null;
}): boolean {
  return String(store.discoveryCampaign?.id ?? "").trim().length > 0;
}

/** DELIVERY_FEE_BENEFIT shelf admission — fee strike evidence only. */
export function storeHasDeliveryFeeBenefitEvidence(store: {
  deliveryFeeStrikePhp?: number | null;
}): boolean {
  const strike = store.deliveryFeeStrikePhp;
  return strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0;
}
