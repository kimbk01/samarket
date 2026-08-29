/**
 * Stores A — HOME insertion meta (CUT 4: rest_stores paid insertion + coupon rails).
 *
 * CUT A — storeEligibleById: null (PARTIAL → CUT D). Surface policy via
 * COMPATIBILITY_SURFACE_POLICY_KEYS (ad_integration / homePaidAdInsertion).
 * @see lib/stores/advertising/delivery-ad-layers.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  homeCouponInsertions,
  homePaidAdInsertionPolicyEnabled,
  homePaidAdInsertionPolicyMax,
  planStoresHomeRestPaidInsertions,
  STORES_INSERTION_DEFAULT_INTERVAL,
  type StoresBrowseInsertionPlan,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import {
  loadActiveStoreCouponCampaigns,
  loadActiveStorePaidAdCampaigns,
} from "@/lib/stores/load-store-insertion-campaigns";
import {
  resolveHomeRestPaidSurfaceAllowed,
  selectExposureEligibleStorePaidAds,
} from "@/lib/stores/store-paid-ad-exposure";
import { selectDiscoveryEligibleStoreCoupons } from "@/lib/stores/store-coupon-eligibility";

export type StoresHomeRestInsertionMetaRow =
  | { kind: "organic"; storeId: string }
  | {
      kind: "paid_ad";
      campaignId: string;
      storeId: string;
      title: string;
      headline: string;
      bodyCopy: string | null;
      imageUrl: string | null;
      placement: string;
      isSponsored: true;
    };

export type StoresHomeInsertionMeta = {
  /** Eligible rest_stores paid campaigns (not a separate HOME ad shelf). */
  paidAds: Array<{
    id: string;
    storeId: string;
    title: string;
    headline: string;
    bodyCopy: string | null;
    imageUrl: string | null;
    placement: string;
  }>;
  coupons: Array<{
    id: string;
    storeId: string;
    title: string;
    discountType: string;
    discountValue: number;
    minOrderAmount: number | null;
    termsCopy: string | null;
  }>;
  /** CUT 4 — deterministic insertion plan for rest_stores only. */
  restInsertion: {
    organicIds: string[];
    rows: StoresHomeRestInsertionMetaRow[];
    adCount: number;
    sponsoredStoreIds: string[];
    surfaceAllowed: boolean;
  };
};

function mapRestPlan(plan: StoresBrowseInsertionPlan): StoresHomeInsertionMeta["restInsertion"] {
  const rows: StoresHomeRestInsertionMetaRow[] = plan.rows.map((row) => {
    if (row.kind === "organic") return { kind: "organic", storeId: row.storeId };
    if (row.kind === "paid_ad") {
      const p = row.payload;
      return {
        kind: "paid_ad",
        campaignId: p.id,
        storeId: p.storeId,
        title: p.title,
        headline: p.headline,
        bodyCopy: p.bodyCopy,
        imageUrl: p.imageUrl,
        placement: p.placement,
        isSponsored: true as const,
      };
    }
    /** Coupon rows are not part of HOME rest paid plan. */
    return { kind: "organic", storeId: row.storeId };
  });
  return {
    organicIds: plan.organicIds,
    rows,
    adCount: plan.adCount,
    sponsoredStoreIds: plan.sponsoredStoreIds,
    surfaceAllowed: false,
  };
}

export async function loadStoresHomeInsertionMeta(
  sb: SupabaseClient,
  input?: {
    restOrganicStoreIds?: readonly string[];
    restShelfAdIntegration?: string | null;
  }
): Promise<StoresHomeInsertionMeta> {
  const policyBundle = await loadRuntimeCompositionPolicy(sb, "home");
  const restOrganicStoreIds = input?.restOrganicStoreIds ?? [];
  const surfaceAllowed = resolveHomeRestPaidSurfaceAllowed({
    restShelfAdIntegration: input?.restShelfAdIntegration,
    homePaidAdInsertionEnabled: homePaidAdInsertionPolicyEnabled(policyBundle.rows),
  });

  const [paidAdsRaw, couponsRaw] = await Promise.all([
    loadActiveStorePaidAdCampaigns(sb, "stores_home"),
    loadActiveStoreCouponCampaigns(sb),
  ]);

  const taxonomyMatchedStoreIds = new Set(restOrganicStoreIds);
  const exposure = selectExposureEligibleStorePaidAds({
    campaigns: paidAdsRaw,
    targetPlacement: "stores_home",
    surfaceAllowed,
    taxonomyMatchedStoreIds,
    storeEligibleById: null,
  });

  const plan = planStoresHomeRestPaidInsertions({
    organicStoreIds: restOrganicStoreIds,
    paidAds: exposure.eligible,
    max: homePaidAdInsertionPolicyMax(policyBundle.rows),
    intervalEveryN: STORES_INSERTION_DEFAULT_INTERVAL,
    surfaceAllowed,
  });

  const restInsertion = {
    ...mapRestPlan(plan),
    surfaceAllowed,
  };

  const paidAds = exposure.eligible.map((p) => ({
    id: p.id,
    storeId: p.storeId,
    title: p.title,
    headline: p.headline,
    bodyCopy: p.bodyCopy,
    imageUrl: p.imageUrl,
    placement: p.placement,
  }));

  const couponsEligible = selectDiscoveryEligibleStoreCoupons({ campaigns: couponsRaw });
  const coupons = homeCouponInsertions(couponsEligible, policyBundle.rows).map((c) => ({
    id: c.id,
    storeId: c.storeId,
    title: c.title,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderAmount: c.minOrderAmount,
    termsCopy: c.termsCopy,
  }));

  return { paidAds, coupons, restInsertion };
}

export function attachHomeFeedInsertionMeta<T extends { meta?: Record<string, unknown> }>(
  payload: T,
  insertions: StoresHomeInsertionMeta | null
): T {
  if (!insertions) return payload;
  return {
    ...payload,
    meta: {
      ...(payload.meta ?? {}),
      homeInsertions: insertions,
    },
  };
}
