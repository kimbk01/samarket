import { NextRequest, NextResponse } from "next/server";
import { loadVisibleStoresHomeHeroBanners } from "@/lib/stores/load-store-banner-ad-campaigns";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { markSampleStoreBannerSlides } from "@/lib/stores/advertising/mark-sample-store-banner-slides";
import { resolveDeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CUT 5 — public HOME hero banner slides (ONE Banner authority).
 * Empty list = hide hero (no static/fake campaign fallback).
 */
export async function GET(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true, banners: [] as const, meta: { source: "supabase_unconfigured" as const } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  // ADC-04: 매장 목록(home-feed)과 같은 origin — 배달 불가 매장 배너 제외
  const origin = await resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams);
  /**
   * 묶음4 R-1 — 홈 피드와 같은 배달 열람 게이트. 비로그인·주소 없는 회원에게 홈은 배너 대신
   * 로그인/주소 안내만 그리므로 서버도 배너(광고 노출 토큰 포함)를 내보내지 않는다.
   */
  const viewerGate = resolveDeliveryViewerGate(origin);
  if (viewerGate !== "ok") {
    return NextResponse.json(
      { ok: true, banners: [] as const, meta: { viewer_gate: viewerGate, count: 0 } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const banners = await markSampleStoreBannerSlides(
    sb,
    await loadVisibleStoresHomeHeroBanners(sb, Date.now(), origin).catch(() => [])
  );
  return NextResponse.json(
    {
      ok: true,
      banners,
      meta: {
        authority: "delivery_ad_creatives" as const,
        inventory: "STORES_HOME_HERO" as const,
        surface: "stores_home_hero" as const,
        count: banners.length,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
