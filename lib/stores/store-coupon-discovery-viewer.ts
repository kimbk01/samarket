import type { SupabaseClient } from "@supabase/supabase-js";
import { isFirstOrderTargetEligible } from "@/lib/stores/store-coupon-first-order";
import type { StoreCouponCampaignRow } from "@/lib/stores/store-coupon-campaign-authority";
import type { StoreCouponFirstOrderScope } from "@/lib/stores/store-coupon-ssot";

export type ViewerCouponDiscoveryContext = {
  completedStoreIds: Set<string>;
  hasCompletedOrderOnPlatform: boolean;
  blockedCampaignIds: Set<string>;
};

export async function loadViewerCouponDiscoveryContext(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<ViewerCouponDiscoveryContext> {
  const uid = viewerUserId.trim();
  const completedStoreIds = new Set<string>();
  let hasCompletedOrderOnPlatform = false;
  const blockedCampaignIds = new Set<string>();
  if (!uid) {
    return { completedStoreIds, hasCompletedOrderOnPlatform, blockedCampaignIds };
  }
  const [{ data: orders }, { data: ents }] = await Promise.all([
    sb
      .from("store_orders")
      .select("store_id")
      .eq("buyer_user_id", uid)
      .eq("order_status", "completed")
      .limit(500),
    sb
      .from("coupon_user_entitlements")
      .select("campaign_id, status")
      .eq("buyer_user_id", uid)
      .in("status", ["redeemed", "revoked"]),
  ]);
  for (const row of orders ?? []) {
    const sid = String((row as { store_id?: string }).store_id ?? "").trim();
    if (sid) completedStoreIds.add(sid);
  }
  hasCompletedOrderOnPlatform = completedStoreIds.size > 0;
  for (const row of ents ?? []) {
    const id = String((row as { campaign_id?: string }).campaign_id ?? "").trim();
    if (id) blockedCampaignIds.add(id);
  }
  return { completedStoreIds, hasCompletedOrderOnPlatform, blockedCampaignIds };
}

export function filterDiscoveryCouponsForViewer(
  campaigns: readonly (StoreCouponCampaignRow & { firstOrderScope?: StoreCouponFirstOrderScope | null })[],
  viewer: ViewerCouponDiscoveryContext | null
): StoreCouponCampaignRow[] {
  if (!viewer) return [...campaigns];
  return campaigns.filter((c) => {
    if (viewer.blockedCampaignIds.has(c.id)) return false;
    return isFirstOrderTargetEligible({
      scope: c.firstOrderScope ?? null,
      hasCompletedOrderAtStore: viewer.completedStoreIds.has(c.storeId),
      hasCompletedOrderOnPlatform: viewer.hasCompletedOrderOnPlatform,
    });
  });
}
