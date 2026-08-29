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

/** Owner aggregate performance across owned campaigns only. */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

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
  const campaignIds = [...sponsored, ...banners].map((c) => c.id);
  const range = req.nextUrl.searchParams.get("range");

  const result = await loadDeliveryAdPerformance(sb, { campaignIds, range });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, performance: result.payload });
}
