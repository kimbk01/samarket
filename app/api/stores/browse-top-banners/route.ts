import { NextRequest, NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadVisiblePhysicalBannerSlides } from "@/lib/stores/load-delivery-ad-physical-banners";
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

  const banners = await loadVisiblePhysicalBannerSlides(sb, {
    inventoryKey: "STORES_CATEGORY_TOP",
    dbSurface: "stores_browse_top",
    physicalEnabled: true,
    capacity: policy.capacity,
  });
  return NextResponse.json({
    ok: true,
    banners,
    physicalEnabled: true,
    position: policy.position,
    capacity: policy.capacity,
  });
}
