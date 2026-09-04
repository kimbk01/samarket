/**
 * Stores A — HOME insertion meta (CUT 4: rest_stores paid insertion + coupon rails).
 *
 * CUT D — storeEligibleById from organic Delivery pool (null→true REMOVED).
 * Eligibility pool = home-feed delivery stores when provided; rest shelf ids for layout only.
 * Surface policy still COMPATIBILITY (ad_integration / homePaidAdInsertion).
 * Inventory relation is canonical for placement identity.
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
import { buildStoreSponsoredEligibilityMapFromOrganicPool } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { issueEligibleDeliveryAdExposure } from "@/lib/stores/advertising/delivery-ad-exposure-token";

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
      /** CUT G — server-issued exposure context */
      exposureToken: string;
    };

export type StoresHomeInsertionMeta = {
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
  restInsertion: {
    organicIds: string[];
    rows: StoresHomeRestInsertionMetaRow[];
    adCount: number;
    sponsoredStoreIds: string[];
    surfaceAllowed: boolean;
  };
};

function emptyHomeInsertionMeta(
  restOrganicStoreIds: readonly string[],
  surfaceAllowed: boolean
): StoresHomeInsertionMeta {
  return {
    paidAds: [],
    coupons: [],
    restInsertion: {
      organicIds: [...restOrganicStoreIds],
      rows: restOrganicStoreIds.map((storeId) => ({ kind: "organic" as const, storeId })),
      adCount: 0,
      sponsoredStoreIds: [],
      surfaceAllowed,
    },
  };
}

function mapRestPlan(plan: StoresBrowseInsertionPlan): StoresHomeInsertionMeta["restInsertion"] {
  const rows: StoresHomeRestInsertionMetaRow[] = plan.rows.map((row) => {
    if (row.kind === "organic") return { kind: "organic", storeId: row.storeId };
    if (row.kind === "paid_ad") {
      const p = row.payload;
      const { token } = issueEligibleDeliveryAdExposure({
        campaignId: p.id,
        productKind: "store_sponsored",
        creativeId: null,
        inventoryId: null,
        storeId: p.storeId,
        surface:
          p.placement === "stores_browse" ? "STORES_CATEGORY_FEED" : "STORES_HOME_FEED",
        destinationType: "store_detail",
        destinationId: p.storeId,
        preview: false,
      });
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
        exposureToken: token,
      };
    }
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
    /**
     * Delivery organic/serviceability universe for STORES_HOME_FEED eligibility.
     * Defaults to rest shelf ids. Prefer full home-feed store ids so stores
     * allocated to earlier shelves remain eligible for rest paid insertion.
     */
    eligibilityStoreIds?: readonly string[];
    restShelfAdIntegration?: string | null;
  }
): Promise<StoresHomeInsertionMeta> {
  const restOrganicStoreIds = input?.restOrganicStoreIds ?? [];
  const eligibilityStoreIds =
    input?.eligibilityStoreIds?.length ? input.eligibilityStoreIds : restOrganicStoreIds;
  try {
    const policyBundle = await loadRuntimeCompositionPolicy(sb, "home");
    const surfaceAllowed = resolveHomeRestPaidSurfaceAllowed({
      restShelfAdIntegration: input?.restShelfAdIntegration,
      homePaidAdInsertionEnabled: homePaidAdInsertionPolicyEnabled(policyBundle.rows),
    });

    const [paidAdsRaw, couponsRaw] = await Promise.all([
      loadActiveStorePaidAdCampaigns(sb, "stores_home"),
      loadActiveStoreCouponCampaigns(sb),
    ]);

    const taxonomyMatchedStoreIds = new Set(eligibilityStoreIds);
    const storeEligibleById =
      buildStoreSponsoredEligibilityMapFromOrganicPool(eligibilityStoreIds);
    const exposure = selectExposureEligibleStorePaidAds({
      campaigns: paidAdsRaw,
      targetPlacement: "stores_home",
      surfaceAllowed,
      taxonomyMatchedStoreIds,
      storeEligibleById,
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
  } catch (e) {
    console.error("[loadStoresHomeInsertionMeta]", e instanceof Error ? e.message : e);
    return emptyHomeInsertionMeta(restOrganicStoreIds, false);
  }
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
