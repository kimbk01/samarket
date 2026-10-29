import { NextRequest, NextResponse } from "next/server";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadResolvedCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-db";
import { homeBannerBeforeRestPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";
import { markSampleStoreBannerSlides } from "@/lib/stores/advertising/mark-sample-store-banner-slides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stores/home-before-rest-banners — Stage 2 HOME Banner before rest_stores. */
export async function GET(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  const { rows } = await loadResolvedCompositionPolicy(sb, "home");
  const physicalEnabled = homeBannerBeforeRestPolicyEnabled(rows);
  if (!physicalEnabled) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  // ADC-04: 매장 목록(home-feed)과 같은 origin — 배달 불가 매장 배너 제외
  const origin = await resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams);
  const slides = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_HOME_INLINE_1",
    dbSurface: "stores_home_inline",
    physicalEnabled: true,
    capacity: 1,
    viewerOrigin: origin,
  });
  /** B-10 — 샘플 매장 배너 표시 */
  const banners = await markSampleStoreBannerSlides(sb, slides);
  return NextResponse.json({ ok: true, banners, physicalEnabled: true });
}
