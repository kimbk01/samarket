import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isAdminDeliveryAdProduct,
  type AdminDeliveryAdListBucket,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  loadAdminDeliveryAdCampaignList,
  loadAdminDeliveryAdCampaignPage,
  type AdminDeliveryAdPageView,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKETS = new Set([
  "all",
  "review",
  "scheduled",
  "active",
  "held",
  "ended",
  "rejected",
  "review_unfunded",
]);

/** R7 서버 페이지 보기 (`view`) — 허브 보기 + 목록 버킷. */
const PAGE_VIEWS = new Set<string>([
  "all",
  "actionable",
  "history",
  "needs_creative",
  "review",
  "scheduled",
  "active",
  "held",
  "ended",
  "rejected",
  "review_unfunded",
]);

const PRICING = {
  model: "FIXED_DURATION_PACKAGE",
  billing: "BUSINESS_CASH",
  packageAuthority: "delivery_ad_packages",
  orderPercentChargeCollection: false,
} as const;

/**
 * GET /api/admin/delivery-ads
 * - `view` 또는 `offset` 이 있으면 R7 서버 페이지: `{ ok, campaigns, total, limit, offset, summary, policyCounts, todayCounts, pricing }`
 *   (보기·필터·정렬·페이지·전체 건수 = DB RPC 한 번, 한 페이지 최대 100).
 * - 없으면 기존 응답 (`bucket`·`limit` 목록 — 다른 호출자 호환).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const productRaw = sp.get("product") ?? "all";
  const product: AdminDeliveryAdProduct | "all" =
    productRaw === "all"
      ? "all"
      : isAdminDeliveryAdProduct(productRaw)
        ? productRaw
        : "all";
  if (sp.has("view") || sp.has("offset")) {
    const viewRaw = (sp.get("view") ?? sp.get("bucket") ?? "all").trim();
    const view = (PAGE_VIEWS.has(viewRaw) ? viewRaw : "all") as AdminDeliveryAdPageView;
    const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: 100 });
    const storeId = (sp.get("storeId") ?? "").trim();
    const ownerUserId = (sp.get("ownerUserId") ?? "").trim();
    if ((storeId && !isUuidLikeString(storeId)) || (ownerUserId && !isUuidLikeString(ownerUserId))) {
      return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }
    const result = await loadAdminDeliveryAdCampaignPage(sb, {
      product,
      view,
      storeId: storeId || null,
      ownerUserId: ownerUserId || null,
      inventoryKey: sp.get("inventory") ?? sp.get("inventoryKey"),
      primarySlug: sp.get("primarySlug") ?? sp.get("primary"),
      subSlug: sp.get("subSlug") ?? sp.get("sub"),
      limit: page.limit,
      offset: page.offset,
    });
    if (result.error) {
      console.error("[admin/delivery-ads GET page]", "db_error", result.error);
      return NextResponse.json(
        { ok: false, error: "db_error", campaigns: [], total: 0 },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      campaigns: result.items,
      total: result.total,
      limit: page.limit,
      offset: page.offset,
      summary: result.summary,
      policyCounts: result.policyCounts,
      todayCounts: result.todayCounts,
      pricing: PRICING,
    });
  }

  const bucketRaw = sp.get("bucket") ?? "all";
  const bucket = (BUCKETS.has(bucketRaw) ? bucketRaw : "all") as AdminDeliveryAdListBucket;

  const result = await loadAdminDeliveryAdCampaignList(sb, {
    product,
    bucket,
    storeId: sp.get("storeId"),
    ownerUserId: sp.get("ownerUserId"),
    inventoryKey: sp.get("inventory") ?? sp.get("inventoryKey"),
    primarySlug: sp.get("primarySlug") ?? sp.get("primary"),
    subSlug: sp.get("subSlug") ?? sp.get("sub"),
    limit: Number(sp.get("limit") || 200) || 200,
  });

  if (result.error) {
    console.error("[admin/delivery-ads GET list]", "db_error", result.error);
    return NextResponse.json(
      {
        ok: false,
        error: "db_error",
        campaigns: [],
        summary: result.summary,
        policyCounts: result.policyCounts,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    campaigns: result.items,
    summary: result.summary,
    policyCounts: result.policyCounts,
    pricing: PRICING,
  });
}
