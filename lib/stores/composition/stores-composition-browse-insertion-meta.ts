/**
 * Stores A — attach browse insertion plan to API meta (organic order preserved).
 * CUT 4 — exposure authority → then insertion (after organic).
 *
 * CUT D — storeEligibleById from organic pool (null→true REMOVED).
 * Surface policy COMPATIBILITY (ad_enabled). Inventory canonical for placement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresBrowseResponseBody } from "@/lib/stores/stores-browse-build";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import {
  loadActiveStoreCouponCampaigns,
  loadActiveStorePaidAdCampaigns,
} from "@/lib/stores/load-store-insertion-campaigns";
import { selectDiscoveryEligibleStoreCoupons } from "@/lib/stores/store-coupon-eligibility";
import {
  filterDiscoveryCouponsForViewer,
  loadViewerCouponDiscoveryContext,
} from "@/lib/stores/store-coupon-discovery-viewer";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  resolveStoresBrowseScopeCustomerMeta,
  type StoresBrowseScopeCustomerMeta,
} from "@/lib/stores/product/stores-browse-scope-customer-meta";
import { browseTargetMatchesCustomerScope } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { selectExposureEligibleStorePaidAds } from "@/lib/stores/store-paid-ad-exposure";
import { buildStoreSponsoredEligibilityMapFromOrganicPool } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { issueEligibleDeliveryAdExposure } from "@/lib/stores/advertising/delivery-ad-exposure-token";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";

export type { StoresBrowseScopeCustomerMeta };

export type StoresBrowseInsertionMetaRow =
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
      /** CUT G / P0-B — server-issued exposure context (canonical issuer) */
      exposureToken: string;
    }
  | {
      kind: "coupon";
      campaignId: string;
      storeId: string;
      title: string;
      discountType: string;
      discountValue: number;
      minOrderAmount: number | null;
      termsCopy: string | null;
    };

/**
 * P0-B — project sponsored browse insertion row with canonical exposureToken.
 * Does not change eligibility/insertion; only attribution identity for STORES_CATEGORY_FEED.
 */
export function projectBrowsePaidAdInsertionMetaRow(
  payload: Pick<
    StorePaidAdCampaignRow,
    "id" | "storeId" | "title" | "headline" | "bodyCopy" | "imageUrl" | "placement"
  >
): Extract<StoresBrowseInsertionMetaRow, { kind: "paid_ad" }> {
  const { token } = issueEligibleDeliveryAdExposure({
    campaignId: payload.id,
    productKind: "store_sponsored",
    creativeId: null,
    inventoryId: null,
    storeId: payload.storeId,
    surface: "STORES_CATEGORY_FEED",
    destinationType: "store_detail",
    destinationId: payload.storeId,
    preview: false,
  });
  return {
    kind: "paid_ad",
    campaignId: payload.id,
    storeId: payload.storeId,
    title: payload.title,
    headline: payload.headline,
    bodyCopy: payload.bodyCopy,
    imageUrl: payload.imageUrl,
    placement: payload.placement,
    isSponsored: true as const,
    exposureToken: token,
  };
}

function scopePolicyToCompositionRows(
  resolved: ReturnType<typeof resolveBrowseScopePolicy>
): StoresCompositionSectionContract[] {
  const interval =
    resolved.intervalEveryN > 0
      ? ({ consumed: true as const, everyN: resolved.intervalEveryN })
      : ({ consumed: false as const, reason: "NOT_CONSUMED" as const });
  return [
    {
      surface: "browse",
      slot: "organic_discovery_list",
      contentType: "store",
      enabled: true,
      order: 0,
      interval: { consumed: false, reason: "NOT_CONSUMED" },
      max: null,
      titleAuthority: "none",
    },
    {
      surface: "browse",
      slot: "future_ad_insertion",
      contentType: "ad",
      /** surfaceAllowsPaidAd only — campaign eligibility is exposure authority. */
      enabled: resolved.adEnabled && resolved.presentationMode !== "hidden",
      order: 1,
      interval,
      max: resolved.maxInsertion,
      titleAuthority: "none",
    },
    {
      surface: "browse",
      slot: "future_coupon_insertion",
      contentType: "coupon",
      /** CUT 8 — paid-style coupon rows removed; couponEnabled remains badge surface only. */
      enabled: false,
      order: 2,
      interval,
      max: resolved.maxInsertion,
      titleAuthority: "none",
    },
  ];
}

async function resolveBrowseInsertionPolicy(
  sb: SupabaseClient,
  primarySlug: string,
  subSlug: string | null
): Promise<readonly StoresCompositionSectionContract[]> {
  try {
    const dbRows = await listBrowseScopePolicyRows(sb);
    const mapped = dbRows.map(mapBrowseScopeDbRow);
    const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
    const pk = primarySlug.trim().toLowerCase();
    const sk = subSlug?.trim().toLowerCase() ?? null;
    const resolved = resolveBrowseScopePolicy({
      primarySlug: pk,
      subSlug: sk && sk !== "all" ? sk : null,
      primaryRow: byScope.get(pk) ?? null,
      subRow: sk && sk !== "all" ? byScope.get(`${pk}/${sk}`) ?? null : null,
    });
    return scopePolicyToCompositionRows(resolved);
  } catch {
    const policyBundle = await loadRuntimeCompositionPolicy(sb, "browse");
    return policyBundle.rows;
  }
}

export async function attachStoresBrowseInsertionMeta(
  sb: SupabaseClient,
  body: StoresBrowseResponseBody,
  scope?: { primarySlug: string; subSlug: string | null; viewerUserId?: string | null }
): Promise<StoresBrowseResponseBody> {
  const scopeMeta = scope
    ? await resolveStoresBrowseScopeCustomerMeta(sb, scope.primarySlug, scope.subSlug).catch(
        () => null
      )
    : null;

  /** Operator disabled this primary/secondary — empty organic list (HOME shelves untouched). */
  const gatedBody =
    scopeMeta && scopeMeta.enabled === false
      ? { ...body, stores: [] as typeof body.stores }
      : body;

  const organicIds = gatedBody.stores.map((s) => s.id);
  const organicSet = new Set(organicIds);

  try {
    const policy = scope
      ? await resolveBrowseInsertionPolicy(sb, scope.primarySlug, scope.subSlug)
      : (await loadRuntimeCompositionPolicy(sb, "browse")).rows;
    const [paidAdsRaw, couponsRaw] = await Promise.all([
      loadActiveStorePaidAdCampaigns(sb, "stores_browse"),
      loadActiveStoreCouponCampaigns(sb),
    ]);

    const couponBadgeByStoreId: Record<string, { title: string }> = {};
    if (scopeMeta?.couponEnabled) {
      let eligible = selectDiscoveryEligibleStoreCoupons({ campaigns: couponsRaw });
      const viewerId = scope?.viewerUserId?.trim() || "";
      if (viewerId) {
        const ctx = await loadViewerCouponDiscoveryContext(sb, viewerId);
        eligible = filterDiscoveryCouponsForViewer(eligible, ctx);
      }
      for (const c of eligible) {
        if (!organicSet.has(c.storeId)) continue;
        if (!couponBadgeByStoreId[c.storeId]) {
          couponBadgeByStoreId[c.storeId] = { title: "" };
        }
      }
    }

    const adPolicy = policy.find((r) => r.surface === "browse" && r.slot === "future_ad_insertion");
    const surfaceAllowed = adPolicy?.enabled === true;
    const taxonomyMatchedStoreIds = new Set(organicIds);
    const storeEligibleById = buildStoreSponsoredEligibilityMapFromOrganicPool(organicIds);
    const scopedByBrowseTarget = scope
      ? paidAdsRaw.filter((c) =>
          browseTargetMatchesCustomerScope({
            browseTargetKind: c.browseTargetKind,
            browsePrimarySlug: c.browsePrimarySlug,
            browseSecondarySlug: c.browseSecondarySlug,
            customerPrimarySlug: scope.primarySlug,
            customerSubSlug: scope.subSlug,
          })
        )
      : paidAdsRaw;
    const exposure = selectExposureEligibleStorePaidAds({
      campaigns: scopedByBrowseTarget,
      targetPlacement: "stores_browse",
      surfaceAllowed,
      taxonomyMatchedStoreIds,
      storeEligibleById,
    });

    const plan = planStoresBrowseInsertions({
      organicStoreIds: organicIds,
      paidAds: exposure.eligible,
      coupons: [],
      policy,
      paidAdsEnabled: surfaceAllowed,
    });

    const rows: StoresBrowseInsertionMetaRow[] = plan.rows.map((row) => {
      if (row.kind === "organic") {
        return { kind: "organic", storeId: row.storeId };
      }
      if (row.kind === "paid_ad") {
        return projectBrowsePaidAdInsertionMetaRow(row.payload);
      }
      return { kind: "organic", storeId: row.storeId };
    });

    return {
      ...gatedBody,
      meta: {
        ...gatedBody.meta,
        compositionEngine: "live",
        browseInsertion: {
          organicIds: plan.organicIds,
          rows,
          adCount: plan.adCount,
          couponCount: plan.couponCount,
          sponsoredStoreIds: plan.sponsoredStoreIds,
          surfaceAllowed,
          couponBadgeByStoreId,
        },
        ...(scopeMeta
          ? {
              browseScopePolicy: {
                primarySlug: scopeMeta.primarySlug,
                subSlug: scopeMeta.subSlug,
                enabled: scopeMeta.enabled,
                displayTitleKo: scopeMeta.displayTitleKo,
                displayTitleEn: scopeMeta.displayTitleEn,
                adEnabled: scopeMeta.adEnabled,
                couponEnabled: scopeMeta.couponEnabled,
                cardType: scopeMeta.cardType,
                defaultSort: scopeMeta.defaultSort,
              },
            }
          : {}),
      },
    };
  } catch (e) {
    console.error("[attachStoresBrowseInsertionMeta]", e instanceof Error ? e.message : e);
    return {
      ...gatedBody,
      meta: {
        ...gatedBody.meta,
        compositionEngine: "live",
        browseInsertion: {
          organicIds,
          rows: organicIds.map((storeId) => ({ kind: "organic" as const, storeId })),
          adCount: 0,
          couponCount: 0,
          sponsoredStoreIds: [],
          surfaceAllowed: false,
          couponBadgeByStoreId: {},
        },
        ...(scopeMeta
          ? {
              browseScopePolicy: {
                primarySlug: scopeMeta.primarySlug,
                subSlug: scopeMeta.subSlug,
                enabled: scopeMeta.enabled,
                displayTitleKo: scopeMeta.displayTitleKo,
                displayTitleEn: scopeMeta.displayTitleEn,
                adEnabled: scopeMeta.adEnabled,
                couponEnabled: scopeMeta.couponEnabled,
                cardType: scopeMeta.cardType,
                defaultSort: scopeMeta.defaultSort,
              },
            }
          : {}),
      },
    };
  }
}
