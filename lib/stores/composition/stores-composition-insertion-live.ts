/**
 * Stores A — composition insertion (organic order preserved).
 * CUT 4 — STORE_PAID_AD insertion for BROWSE + HOME rest_stores.
 *
 * CUT A — INSERTION_PLAN layer only. Does not reorder organic ranking.
 * Pipeline: ORGANIC RESULT + SPONSORED PLAN → INTERLEAVE.
 * @see DELIVERY_AD_ORGANIC_PAID_ISOLATION in lib/stores/advertising
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import type { StoreCouponCampaignRow } from "@/lib/stores/store-coupon-campaign-authority";

export const STORES_INSERTION_DEFAULT_INTERVAL = 8;

export type StoresBrowseInsertionItem =
  | { kind: "organic"; storeId: string }
  | {
      kind: "paid_ad";
      campaignId: string;
      storeId: string;
      payload: StorePaidAdCampaignRow;
      isSponsored: true;
    }
  | { kind: "coupon"; campaignId: string; storeId: string; payload: StoreCouponCampaignRow };

export type StoresBrowseInsertionPlan = {
  organicIds: string[];
  rows: StoresBrowseInsertionItem[];
  adCount: number;
  couponCount: number;
  /** Store ids that appear as sponsored (organic duplicates suppressed). */
  sponsoredStoreIds: string[];
};

function policyRow(
  policy: readonly StoresCompositionSectionContract[],
  slot: string,
  surface: "browse" | "home" = "browse"
): StoresCompositionSectionContract | undefined {
  return policy.find((r) => r.surface === surface && r.slot === slot);
}

function insertionInterval(row: StoresCompositionSectionContract | undefined): number {
  if (!row?.enabled) return 0;
  if (row.interval.consumed && row.interval.everyN > 0) return row.interval.everyN;
  return STORES_INSERTION_DEFAULT_INTERVAL;
}

function shouldInsertPaidAt(
  organicPos: number,
  organicLen: number,
  interval: number,
  adIdx: number,
  adsLen: number
): boolean {
  if (adIdx >= adsLen || interval <= 0) return false;
  if (organicPos % interval === 0) return true;
  /** Small catalogs (< interval): still place remaining ads once after the last organic. */
  return organicLen > 0 && organicLen < interval && organicPos === organicLen;
}

function capItems<T>(items: readonly T[], max: number | null | undefined): T[] {
  if (max == null) return [...items];
  return items.slice(0, Math.max(0, max));
}

/**
 * Interleave paid ads after organic rows without reordering organic IDs.
 * CUT 4: when a store is inserted as paid_ad, suppress its organic duplicate row.
 * CUT 8 TARGET: coupon = organic card decoration only — NO paid-style coupon row insertion.
 */
export function planStoresBrowseInsertions(input: {
  organicStoreIds: readonly string[];
  paidAds: readonly StorePaidAdCampaignRow[];
  /** @deprecated CUT 8 — ignored; coupon rows no longer inserted. */
  coupons?: readonly StoreCouponCampaignRow[];
  policy: readonly StoresCompositionSectionContract[];
  /** When false, paid ads skipped even if policy enabled (surfaceAllowed already filtered ads). */
  paidAdsEnabled?: boolean;
}): StoresBrowseInsertionPlan {
  const organicIds = [...input.organicStoreIds];
  const organicSet = new Set(organicIds);
  const adPolicy = policyRow(input.policy, "future_ad_insertion");
  const adInterval = insertionInterval(adPolicy);
  const paidAdsEnabled = input.paidAdsEnabled !== false && adPolicy?.enabled === true;
  /** Campaigns must belong to this browse scope's organic stores (primary/secondary). */
  const scopedAds = input.paidAds.filter((a) => organicSet.has(a.storeId));
  const ads = paidAdsEnabled ? capItems(scopedAds, adPolicy?.max) : [];
  /** CUT 8 — coupon paid-style insertion removed; badge uses couponEnabled surface separately. */
  const coupons: StoreCouponCampaignRow[] = [];

  if (ads.length === 0 && coupons.length === 0) {
    return {
      organicIds,
      rows: organicIds.map((storeId) => ({ kind: "organic", storeId })),
      adCount: 0,
      couponCount: 0,
      sponsoredStoreIds: [],
    };
  }

  const usedAd = new Set<string>();
  const sponsoredStoreIds = new Set<string>();
  let adIdx = 0;
  const rows: StoresBrowseInsertionItem[] = [];
  let adCount = 0;

  for (let i = 0; i < organicIds.length; i += 1) {
    const storeId = organicIds[i]!;
    /** CUT 4 — suppress organic duplicate when this store already took a sponsored slot */
    if (!sponsoredStoreIds.has(storeId)) {
      rows.push({ kind: "organic", storeId });
    }

    const organicPos = i + 1;
    if (
      paidAdsEnabled &&
      shouldInsertPaidAt(organicPos, organicIds.length, adInterval, adIdx, ads.length)
    ) {
      const ad = ads[adIdx]!;
      if (!usedAd.has(ad.id)) {
        rows.push({
          kind: "paid_ad",
          campaignId: ad.id,
          storeId: ad.storeId,
          payload: ad,
          isSponsored: true,
        });
        usedAd.add(ad.id);
        sponsoredStoreIds.add(ad.storeId);
        adCount += 1;
        /** If we already emitted organic for this store earlier, strip it (paid wins). */
        const organicIdx = rows.findIndex((r) => r.kind === "organic" && r.storeId === ad.storeId);
        if (organicIdx >= 0) rows.splice(organicIdx, 1);
      }
      adIdx += 1;
    }
  }

  return {
    organicIds,
    rows,
    adCount,
    couponCount: 0,
    sponsoredStoreIds: [...sponsoredStoreIds],
  };
}

/**
 * CUT 4 — HOME rest_stores paid insertion (not a separate HOME ad shelf).
 * Organic relative order of non-sponsored stores preserved; ads OFF → baseline organicIds.
 */
export function planStoresHomeRestPaidInsertions(input: {
  organicStoreIds: readonly string[];
  paidAds: readonly StorePaidAdCampaignRow[];
  max: number | null;
  intervalEveryN?: number;
  surfaceAllowed: boolean;
}): StoresBrowseInsertionPlan {
  const organicIds = [...input.organicStoreIds];
  if (!input.surfaceAllowed || input.paidAds.length === 0) {
    return {
      organicIds,
      rows: organicIds.map((storeId) => ({ kind: "organic", storeId })),
      adCount: 0,
      couponCount: 0,
      sponsoredStoreIds: [],
    };
  }

  const interval =
    input.intervalEveryN != null && input.intervalEveryN > 0
      ? input.intervalEveryN
      : STORES_INSERTION_DEFAULT_INTERVAL;
  const ads = capItems(input.paidAds, input.max);
  const usedAd = new Set<string>();
  const sponsoredStoreIds = new Set<string>();
  let adIdx = 0;
  const rows: StoresBrowseInsertionItem[] = [];
  let adCount = 0;

  for (let i = 0; i < organicIds.length; i += 1) {
    const storeId = organicIds[i]!;
    if (!sponsoredStoreIds.has(storeId)) {
      rows.push({ kind: "organic", storeId });
    }
    const organicPos = i + 1;
    if (shouldInsertPaidAt(organicPos, organicIds.length, interval, adIdx, ads.length)) {
      const ad = ads[adIdx]!;
      if (!usedAd.has(ad.id)) {
        rows.push({
          kind: "paid_ad",
          campaignId: ad.id,
          storeId: ad.storeId,
          payload: ad,
          isSponsored: true,
        });
        usedAd.add(ad.id);
        sponsoredStoreIds.add(ad.storeId);
        adCount += 1;
        const organicIdx = rows.findIndex((r) => r.kind === "organic" && r.storeId === ad.storeId);
        if (organicIdx >= 0) rows.splice(organicIdx, 1);
      }
      adIdx += 1;
    }
  }

  return {
    organicIds,
    rows,
    adCount,
    couponCount: 0,
    sponsoredStoreIds: [...sponsoredStoreIds],
  };
}

/** @deprecated CUT 4 — use resolveHomeRestPaidSurfaceAllowed + exposure resolver */
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
  /**
   * CUT 6 — homeCouponInsertion is NOT campaign eligibility.
   * It only caps discovery coupon payload size for HOME badges.
   * Surface permission = shelf coupon_integration (couponBadgeAllowed) at render.
   */
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "coupon" && r.slot === "homeCouponInsertion"
  );
  return capItems(coupons, row?.max ?? null);
}

/** CUT 6 — explicit couponBadgeAllowed from HOME composition coupon rail (legacy). */
export function homeCouponBadgeSurfaceAllowed(
  policy: readonly StoresCompositionSectionContract[]
): boolean {
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "coupon" && r.slot === "homeCouponInsertion"
  );
  /** Rail enabled OR any shelf may still show when coupon_integration ≠ off — rail is soft global hint. */
  return row?.enabled === true;
}

export function homePaidAdInsertionPolicyMax(
  policy: readonly StoresCompositionSectionContract[]
): number | null {
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "ad" && r.slot === "homePaidAdInsertion"
  );
  return row?.max ?? 5;
}

export function homePaidAdInsertionPolicyEnabled(
  policy: readonly StoresCompositionSectionContract[]
): boolean {
  const row = policy.find(
    (r) => r.surface === "home" && r.contentType === "ad" && r.slot === "homePaidAdInsertion"
  );
  return row?.enabled === true;
}

/** Stage 2 — HOME Banner before rest_stores (composition-owned; ≠ native rest insertion). */
export function homeBannerBeforeRestPolicyEnabled(
  policy: readonly StoresCompositionSectionContract[]
): boolean {
  const row = policy.find(
    (r) =>
      r.surface === "home" &&
      r.contentType === "banner" &&
      r.slot === "homeBannerBeforeRest"
  );
  return row?.enabled === true;
}
