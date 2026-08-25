import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadActiveStoreCouponCampaigns } from "@/lib/stores/load-store-insertion-campaigns";
import { loadStoreCouponVisualContextBatch } from "@/lib/stores/load-store-coupon-visual-context";
import { buildStoreDetailCouponCardViews } from "@/lib/stores/store-coupon-product-view";
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
  const rawCampaigns = selectDiscoveryEligibleStoreCoupons({
    campaigns: await loadActiveStoreCouponCampaigns(sb),
    storeIds: new Set([storeId]),
  });
  const ctx = userId
    ? await loadViewerCouponDiscoveryContext(sb, userId)
    : { completedStoreIds: new Set<string>(), hasCompletedOrderOnPlatform: false, blockedCampaignIds: new Set<string>() };

  const heldByCampaignId: Record<string, { entitlementId: string; couponNumber: string | null }> = {};
  if (userId) {
    const { data: held } = await sb
      .from(COUPON_USER_ENTITLEMENTS_TABLE)
      .select("id, campaign_id, coupon_number")
      .eq("buyer_user_id", userId)
      .eq("store_id", storeId)
      .in("status", ["available", "restored"]);
    for (const row of held ?? []) {
      const cid = String((row as { campaign_id?: string }).campaign_id ?? "");
      if (!cid) continue;
      heldByCampaignId[cid] = {
        entitlementId: String((row as { id?: string }).id ?? ""),
        couponNumber:
          (row as { coupon_number?: string | null }).coupon_number == null
            ? null
            : String((row as { coupon_number?: string | null }).coupon_number),
      };
    }
  }

  const forStore = rawCampaigns.filter((c) => c.storeId === storeId);
  const campaignIds = forStore.map((c) => c.id);
  const campaignMeta: Record<string, Record<string, unknown>> = {};
  if (campaignIds.length) {
    const { data: dbRows } = await sb
      .from("store_coupon_campaigns")
      .select(
        "id, store_id, title, discount_type, discount_value, min_order_amount, max_discount, terms_copy, funding_mode, first_order_scope, end_at, campaign_purpose, issuer_role, created_by_user_id"
      )
      .in("id", campaignIds);
    for (const row of dbRows ?? []) {
      campaignMeta[String((row as { id?: string }).id ?? "")] = row as Record<string, unknown>;
    }
  }
  const ineligibleByCampaignId: Record<string, string | null> = {};
  for (const c of forStore) {
    if (heldByCampaignId[c.id]) continue;
    if (ctx.blockedCampaignIds.has(c.id)) {
      ineligibleByCampaignId[c.id] = "already_claimed";
      continue;
    }
    if (
      !isFirstOrderTargetEligible({
        scope: c.firstOrderScope ?? null,
        hasCompletedOrderAtStore: ctx.completedStoreIds.has(storeId),
        hasCompletedOrderOnPlatform: ctx.hasCompletedOrderOnPlatform,
      })
    ) {
      ineligibleByCampaignId[c.id] = "first_order_ineligible";
    }
  }

  const visualByStoreId = await loadStoreCouponVisualContextBatch(sb, [storeId]);
  const campaignRows = forStore.map((c) => {
    const db = campaignMeta[c.id];
    return db ?? {
      id: c.id,
      store_id: c.storeId,
      title: c.title,
      discount_type: c.discountType,
      discount_value: c.discountValue,
      min_order_amount: c.minOrderAmount,
      terms_copy: c.termsCopy,
      funding_mode: "STORE_FUNDED",
      first_order_scope: c.firstOrderScope,
      end_at: c.endAt,
      campaign_purpose: null,
      issuer_role: null,
      created_by_user_id: null,
      max_discount: null,
    };
  });

  const cards = buildStoreDetailCouponCardViews({
    campaigns: campaignRows,
    heldByCampaignId,
    ineligibleByCampaignId,
    visualByStoreId,
    storeId,
  });

  const globalIneligible =
    cards.length === 0 && forStore.some((c) => ineligibleByCampaignId[c.id] === "first_order_ineligible")
      ? "first_order_ineligible"
      : null;

  return NextResponse.json({
    ok: true,
    authed: Boolean(userId),
    campaigns: cards,
    cards,
    ineligibleReason: globalIneligible,
  });
}
