import { NextRequest, NextResponse } from "next/server";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadResolvedCompositionPolicyRowsReadOnly } from "@/lib/stores/composition/stores-composition-policy-db";
import { homeBannerBeforeRestPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";
import { markSampleStoreBannerSlides } from "@/lib/stores/advertising/mark-sample-store-banner-slides";
import { resolveDeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import { STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL } from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stores/home-before-rest-banners — Stage 2 HOME Banner before rest_stores. */
export async function GET(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  // ADC-04: 매장 목록(home-feed)과 같은 origin — 배달 불가 매장 배너 제외
  // 묶음4 F-06 — 정책·origin 은 서로 독립 → 병렬 (순차 왕복 제거)
  // v4 PERF-16 — 고객 GET 은 읽기 전용 정책 조회 (쓰기 RPC `ensure_…surface_state` 미호출)
  const [{ rows }, origin] = await Promise.all([
    loadResolvedCompositionPolicyRowsReadOnly(sb, "home"),
    resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams),
  ]);
  /** 묶음4 R-1 — 홈 피드와 같은 배달 열람 게이트 (비로그인·주소 없음 → 배너 없음) */
  const viewerGate = resolveDeliveryViewerGate(origin);
  if (viewerGate !== "ok") {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false, meta: { viewer_gate: viewerGate } });
  }
  const physicalEnabled = homeBannerBeforeRestPolicyEnabled(rows);
  if (!physicalEnabled) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  const slides = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_HOME_INLINE_1",
    dbSurface: "stores_home_inline",
    physicalEnabled: true,
    // 광고 최종 점검 B-3: 보이는 건 1개지만 첫 배너 이미지가 깨지면 넘어갈 예비 배너까지 받는다
    capacity: STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL,
    viewerOrigin: origin,
  });
  /** B-10 — 샘플 매장 배너 표시 */
  const banners = await markSampleStoreBannerSlides(sb, slides);
  return NextResponse.json({ ok: true, banners, physicalEnabled: true });
}
