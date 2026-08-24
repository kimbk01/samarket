/**
 * Stores A — composition insertion (organic order preserved).
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import type { StoreCouponCampaignRow } from "@/lib/stores/store-coupon-campaign-authority";

export const STORES_INSERTION_DEFAULT_INTERVAL = 8;

export type StoresBrowseInsertionItem =
  | { kind: "organic"; storeId: string }
  | { kind: "paid_ad"; campaignId: string; storeId: string; payload: StorePaidAdCampaignRow }
  | { kind: "coupon"; campaignId: string; storeId: string; payload: StoreCouponCampaignRow };

export type StoresBrowseInsertionPlan = {
  organicIds: string[];
  rows: StoresBrowseInsertionItem[];
  adCount: number;
  couponCount: number;
};

function policyRow(
  policy: readonly StoresCompositionSectionContract[],
  slot: string
): StoresCompositionSectionContract | undefined {
  return policy.find((r) => r.surface === "browse" && r.slot === slot);
}

function insertionInterval(row: StoresCompositionSectionContract | undefined): number {
  if (!row?.enabled) return 0;
  if (row.interval.consumed && row.interval.everyN > 0) return row.interval.everyN;
  return STORES_INSERTION_DEFAULT_INTERVAL;
}

function capItems<T>(items: readonly T[], max: number | null | undefined): T[] {
  if (max == null) return [...items];
  return items.slice(0, Math.max(0, max));
}

/**
 * Interleave paid ads / coupons after organic rows without reordering organic IDs.
 */
export function planStoresBrowseInsertions(input: {
  organicStoreIds: readonly string[];
  paidAds: readonly StorePaidAdCampaignRow[];
  coupons: readonly StoreCouponCampaignRow[];
  policy: readonly StoresCompositionSectionContract[];
}): StoresBrowseInsertionPlan {
  const organicIds = [...input.organicStoreIds];
  const adPolicy = policyRow(input.policy, "future_ad_insertion");
  const couponPolicy = policyRow(input.policy, "future_coupon_insertion");
  const adInterval = insertionInterval(adPolicy);
  const couponInterval = insertionInterval(couponPolicy);
  const ads = capItems(input.paidAds, adPolicy?.max);
  const coupons = capItems(input.coupons, couponPolicy?.max);

  if (!adPolicy?.enabled && !couponPolicy?.enabled) {
    return {
      organicIds,
      rows: organicIds.map((storeId) => ({ kind: "organic", storeId })),
      adCount: 0,
      couponCount: 0,
    };
  }

  const usedAd = new Set<string>();
  const usedCoupon = new Set<string>();
  let adIdx = 0;
  let couponIdx = 0;
  const rows: StoresBrowseInsertionItem[] = [];
  let adCount = 0;
  let couponCount = 0;

  for (let i = 0; i < organicIds.length; i += 1) {
    const storeId = organicIds[i]!;
    rows.push({ kind: "organic", storeId });

    const organicPos = i + 1;
    if (adPolicy?.enabled && adInterval > 0 && organicPos % adInterval === 0 && adIdx < ads.length) {
      const ad = ads[adIdx]!;
      if (!usedAd.has(ad.id)) {
        rows.push({ kind: "paid_ad", campaignId: ad.id, storeId: ad.storeId, payload: ad });
        usedAd.add(ad.id);
        adCount += 1;
      }
      adIdx += 1;
    }
    if (
      couponPolicy?.enabled &&
      couponInterval > 0 &&
      organicPos % couponInterval === 0 &&
      couponIdx < coupons.length
    ) {
      const coupon = coupons[couponIdx]!;
      if (!usedCoupon.has(coupon.id)) {
        rows.push({
          kind: "coupon",
          campaignId: coupon.id,
          storeId: coupon.storeId,
          payload: coupon,
        });
        usedCoupon.add(coupon.id);
        couponCount += 1;
      }
      couponIdx += 1;
    }
  }

  return { organicIds, rows, adCount, couponCount };
}

export function homePaidAdInsertions(
  ads: readonly StorePaidAdCampaignRow[],
  policy: readonly StoresCompositionSectionContract[],
  surfacePlacement: "stores_home" = "stores_home"
): StorePaidAdCampaignRow[] {
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "ad" && r.slot === "homePaidAdInsertion"
  );
  if (!row?.enabled) return [];
  return capItems(
    ads.filter((a) => a.placement === surfacePlacement),
    row.max
  );
}

export function homeCouponInsertions(
  coupons: readonly StoreCouponCampaignRow[],
  policy: readonly StoresCompositionSectionContract[]
): StoreCouponCampaignRow[] {
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "coupon" && r.slot === "homeCouponInsertion"
  );
  if (!row?.enabled) return [];
  return capItems(coupons, row.max);
}
