/**
 * Stores A — HOME insertion meta (paid ad + coupon rails).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  homeCouponInsertions,
  homePaidAdInsertions,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import {
  loadActiveStoreCouponCampaigns,
  loadActiveStorePaidAdCampaigns,
} from "@/lib/stores/load-store-insertion-campaigns";

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
};

export async function loadStoresHomeInsertionMeta(
  sb: SupabaseClient
): Promise<StoresHomeInsertionMeta> {
  const policyBundle = await loadRuntimeCompositionPolicy(sb, "home");
  const [paidAdsRaw, couponsRaw] = await Promise.all([
    loadActiveStorePaidAdCampaigns(sb, "stores_home"),
    loadActiveStoreCouponCampaigns(sb),
  ]);
  const paidAds = homePaidAdInsertions(paidAdsRaw, policyBundle.rows).map((p) => ({
    id: p.id,
    storeId: p.storeId,
    title: p.title,
    headline: p.headline,
    bodyCopy: p.bodyCopy,
    imageUrl: p.imageUrl,
    placement: p.placement,
  }));
  const coupons = homeCouponInsertions(couponsRaw, policyBundle.rows).map((c) => ({
    id: c.id,
    storeId: c.storeId,
    title: c.title,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderAmount: c.minOrderAmount,
    termsCopy: c.termsCopy,
  }));
  return { paidAds, coupons };
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
