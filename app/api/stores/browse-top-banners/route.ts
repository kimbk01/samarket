import { NextRequest, NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";
import { resolveStoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import {
  buildBrowsePrimaryScopeKey,
  buildBrowseSubScopeKey,
  resolveBrowseScopePolicy,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";

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

  const mapped = (await listBrowseScopePolicyRows(sb)).map(mapBrowseScopeDbRow);
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

  if (!policy.enabled) {
    return NextResponse.json({ ok: true, banners: [], physicalEnabled: false });
  }

  // ADC-04: 업종 목록(browse)과 같은 origin — 배달 불가 매장 배너 제외
  const origin = await resolveStoreListDeliveryOrigin(sb, req.nextUrl.searchParams);
  const banners = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_CATEGORY_TOP",
    dbSurface: "stores_browse_top",
    physicalEnabled: true,
    capacity: policy.capacity,
    viewerOrigin: origin,
  });
  return NextResponse.json({
    ok: true,
    banners,
    physicalEnabled: true,
    position: policy.position,
    capacity: policy.capacity,
  });
}
