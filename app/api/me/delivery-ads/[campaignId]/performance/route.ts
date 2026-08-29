import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser } from "@/lib/me/load-me-stores-for-user";
import { listOwnerSponsoredCampaignsForStores } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { listOwnerBannerCampaignsForStores } from "@/lib/stores/advertising/owner-banner-writer";
import { loadDeliveryAdPerformance } from "@/lib/stores/advertising/analytics/delivery-ad-analytics-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

/** Owner single-campaign performance — ownership gated. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { campaignId } = await ctx.params;
  const id = String(campaignId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_campaign" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const storesResult = await loadMeStoresListForUser(sb, userId);
  if (!storesResult.ok) {
    return NextResponse.json({ ok: false, error: storesResult.error }, { status: 500 });
  }
  const storeIds = storesResult.stores.map((s) => s.id);
  const [sponsored, banners] = await Promise.all([
    listOwnerSponsoredCampaignsForStores(sb, userId, storeIds),
    listOwnerBannerCampaignsForStores(sb, userId, storeIds),
  ]);
  const owned = new Set([...sponsored, ...banners].map((c) => c.id));
  if (!owned.has(id)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const range = req.nextUrl.searchParams.get("range");
  const result = await loadDeliveryAdPerformance(sb, { campaignIds: [id], range });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, performance: result.payload });
}
