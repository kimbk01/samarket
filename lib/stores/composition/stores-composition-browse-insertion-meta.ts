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
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

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
      enabled: resolved.couponEnabled && resolved.presentationMode !== "hidden",
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
  scope?: { primarySlug: string; subSlug: string | null }
): Promise<StoresBrowseResponseBody> {
  const organicIds = body.stores.map((s) => s.id);
  const policy = scope
    ? await resolveBrowseInsertionPolicy(sb, scope.primarySlug, scope.subSlug)
    : (await loadRuntimeCompositionPolicy(sb, "browse")).rows;
  const [paidAds, coupons] = await Promise.all([
    loadActiveStorePaidAdCampaigns(sb, "stores_browse"),
    loadActiveStoreCouponCampaigns(sb),
  ]);
  const plan = planStoresBrowseInsertions({
    organicStoreIds: organicIds,
    paidAds,
    coupons,
    policy,
  });

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
