import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadAdminDeliveryAdCampaignDetail } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { loadDeliveryAdPerformance } from "@/lib/stores/advertising/analytics/delivery-ad-analytics-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = String(campaignId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_campaign" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const productRaw = req.nextUrl.searchParams.get("productKind");
  const productHint =
    productRaw && isAdminDeliveryAdProduct(productRaw) ? productRaw : null;

  const detail = await loadAdminDeliveryAdCampaignDetail(sb, id, productHint);
  if (!detail.ok) {
    return NextResponse.json(
      { ok: false, error: detail.error },
      { status: detail.error === "not_found" ? 404 : 500 }
    );
  }

  const range = req.nextUrl.searchParams.get("range");
  const result = await loadDeliveryAdPerformance(sb, { campaignIds: [id], range });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, performance: result.payload });
}
