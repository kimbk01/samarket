import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadActiveStoreCouponCampaigns } from "@/lib/stores/load-store-insertion-campaigns";
import { selectDiscoveryEligibleStoreCoupons } from "@/lib/stores/store-coupon-eligibility";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { COUPON_USER_ENTITLEMENTS_TABLE } from "@/lib/stores/store-coupon-ssot";
import { isFirstOrderTargetEligible } from "@/lib/stores/store-coupon-first-order";
import { loadViewerCouponDiscoveryContext } from "@/lib/stores/store-coupon-discovery-viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured", campaigns: [] }, { status: 503 });
  }
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() ?? "";
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "missing_store_id", campaigns: [] }, { status: 400 });
  }
  const campaigns = selectDiscoveryEligibleStoreCoupons({
    campaigns: await loadActiveStoreCouponCampaigns(sb),
    storeIds: new Set([storeId]),
  });
  const ctx = userId
    ? await loadViewerCouponDiscoveryContext(sb, userId)
    : { completedStoreIds: new Set<string>(), hasCompletedOrderOnPlatform: false, blockedCampaignIds: new Set<string>() };
  let heldIds = new Set<string>();
  if (userId) {
    const { data: held } = await sb
      .from(COUPON_USER_ENTITLEMENTS_TABLE)
      .select("campaign_id")
      .eq("buyer_user_id", userId)
      .eq("store_id", storeId)
      .in("status", ["available", "restored"]);
    heldIds = new Set((held ?? []).map((r) => String((r as { campaign_id?: string }).campaign_id ?? "")));
  }

  const forStore = campaigns.filter((c) => c.storeId === storeId);
  const firstBlocked = forStore.find(
    (c) =>
      !isFirstOrderTargetEligible({
        scope: c.firstOrderScope ?? null,
        hasCompletedOrderAtStore: ctx.completedStoreIds.has(storeId),
        hasCompletedOrderOnPlatform: ctx.hasCompletedOrderOnPlatform,
      })
  );
  const claimable = forStore
    .filter((c) => !heldIds.has(c.id) && !ctx.blockedCampaignIds.has(c.id))
    .filter((c) =>
      isFirstOrderTargetEligible({
        scope: c.firstOrderScope ?? null,
        hasCompletedOrderAtStore: ctx.completedStoreIds.has(storeId),
        hasCompletedOrderOnPlatform: ctx.hasCompletedOrderOnPlatform,
      })
    )
    .map((c) => ({
      id: c.id,
      storeId: c.storeId,
      title: c.title,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount,
      claimed: false,
    }));
  const claimed = forStore
    .filter((c) => heldIds.has(c.id))
    .map((c) => ({
      id: c.id,
      storeId: c.storeId,
      title: c.title,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount,
      claimed: true,
    }));
  const shown = claimed.length ? claimed : claimable;
  return NextResponse.json({
    ok: true,
    authed: Boolean(userId),
    campaigns: shown,
    ineligibleReason: shown.length === 0 && firstBlocked ? "first_order_ineligible" : null,
  });
}
