/**
 * Stores A — attach browse insertion plan to API meta (organic order preserved).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresBrowseResponseBody } from "@/lib/stores/stores-browse-build";
import { loadRuntimeCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import {
  loadActiveStoreCouponCampaigns,
  loadActiveStorePaidAdCampaigns,
} from "@/lib/stores/load-store-insertion-campaigns";

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

export async function attachStoresBrowseInsertionMeta(
  sb: SupabaseClient,
  body: StoresBrowseResponseBody
): Promise<StoresBrowseResponseBody> {
  const organicIds = body.stores.map((s) => s.id);
  const policyBundle = await loadRuntimeCompositionPolicy(sb, "browse");
  const [paidAds, coupons] = await Promise.all([
    loadActiveStorePaidAdCampaigns(sb, "stores_browse"),
    loadActiveStoreCouponCampaigns(sb),
  ]);
  const plan = planStoresBrowseInsertions({
    organicStoreIds: organicIds,
    paidAds,
    coupons,
    policy: policyBundle.rows,
  });

  const storeById = new Map(body.stores.map((s) => [s.id, s]));
  const rows: StoresBrowseInsertionMetaRow[] = plan.rows.map((row) => {
    if (row.kind === "organic") {
      return { kind: "organic", storeId: row.storeId };
    }
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
      };
    }
    const c = row.payload;
    return {
      kind: "coupon",
      campaignId: c.id,
      storeId: c.storeId,
      title: c.title,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount,
      termsCopy: c.termsCopy,
    };
  });

  return {
    ...body,
    meta: {
      ...body.meta,
      compositionEngine: "live",
      browseInsertion: {
        organicIds: plan.organicIds,
        rows,
        adCount: plan.adCount,
        couponCount: plan.couponCount,
      },
    },
  };
}
