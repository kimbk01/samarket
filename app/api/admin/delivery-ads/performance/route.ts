import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminDeliveryAdCampaignList } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  loadDeliveryAdPerformance,
  loadDeliveryAdPerformanceBreakdown,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin aggregate performance for filtered campaign list (batch, no N+1). */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const range = sp.get("range");
  const breakdown = sp.get("breakdown"); // product | inventory | campaign | day
  const scope = sp.get("scope"); // list | all

  if (scope === "all" && !breakdown) {
    const result = await loadDeliveryAdPerformance(sb, {
      campaignIds: [],
      allCampaigns: true,
      range,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, performance: result.payload });
  }

  const list = await loadAdminDeliveryAdCampaignList(sb, {
    product: "all",
    bucket: "all",
    limit: Number(sp.get("limit") || 200) || 200,
  });
  const campaignIds = list.items.map((c) => c.id);

  if (
    breakdown === "product" ||
    breakdown === "inventory" ||
    breakdown === "campaign" ||
    breakdown === "day"
  ) {
    const result = await loadDeliveryAdPerformanceBreakdown(sb, {
      campaignIds: scope === "all" ? null : campaignIds,
      groupBy: breakdown,
      range,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      platform: result.platform,
      breakdown: breakdown,
      rows: result.rows,
    });
  }

  const result = await loadDeliveryAdPerformance(sb, { campaignIds, range });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, performance: result.payload });
}
