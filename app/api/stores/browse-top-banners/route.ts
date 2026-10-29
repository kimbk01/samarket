import { NextRequest, NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";
import { markSampleStoreBannerSlides } from "@/lib/stores/advertising/mark-sample-store-banner-slides";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import { resolveDeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import {
  buildBrowsePrimaryScopeKey,
  buildBrowseSubScopeKey,
  resolveBrowseScopePolicy,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isBrowseScopeCustomerVisible } from "@/lib/stores/product/stores-browse-scope-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stores/browse-top-banners?primary=&sub= — Stage 2 BROWSE top_context Banner. */
export async function GET(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }
  const primary = String(req.nextUrl.searchParams.get("primary") ?? "").trim();
  const subRaw = String(req.nextUrl.searchParams.get("sub") ?? "").trim();
  const sub = !subRaw || subRaw === "all" ? null : subRaw;
  if (!primary) {
    return NextResponse.json({ ok: false, error: "missing_primary" }, { status: 400 });
  }

  /**
   * v4 API-14 — 업종 목록(browse)과 같은 배달 열람 게이트(`resolveDeliveryViewerGate`). 비로그인·주소 없는 회원은
   * 업종 목록 대신 로그인/주소 안내만 그리므로 배너(광고 노출 토큰 포함)를 내보내지 않는다.
   * ADC-04: 업종 목록과 같은 origin — 정책 조회와 병렬 (서로 독립).
   */
  const [policyRows, origin] = await Promise.all([
    listBrowseScopePolicyRows(sb),
    resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams),
  ]);
  const viewerGate = resolveDeliveryViewerGate(origin);
  if (viewerGate !== "ok") {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false, meta: { viewer_gate: viewerGate } });
  }
  const mapped = policyRows.map(mapBrowseScopeDbRow);
  const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
  const primaryRow = byScope.get(buildBrowsePrimaryScopeKey(primary)) ?? null;
  const subRow = sub ? byScope.get(buildBrowseSubScopeKey(primary, sub)) ?? null : null;
  const resolved = resolveBrowseScopePolicy({
    primarySlug: primary,
    subSlug: sub,
    primaryRow,
    subRow,
  });
  const policy = resolved.bannerAds;

  /** P-08 — 업종이 꺼졌거나 기간 밖이면 배너도 없음 (목록·업종 탭과 같은 판정). */
  if (!policy.enabled || !isBrowseScopeCustomerVisible(resolved)) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }

  const slides = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_CATEGORY_TOP",
    dbSurface: "stores_browse_top",
    physicalEnabled: true,
    capacity: policy.capacity,
    viewerOrigin: origin,
    browsePage: { primarySlug: primary, subSlug: sub },
  });
  /** B-10 — 샘플 매장 배너 표시 */
  const banners = await markSampleStoreBannerSlides(sb, slides);
  return NextResponse.json({
    ok: true,
    banners,
    physicalEnabled: true,
    position: policy.position,
    capacity: policy.capacity,
  });
}
