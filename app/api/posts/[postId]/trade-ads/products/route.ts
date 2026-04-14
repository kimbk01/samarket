import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { mapPostDetailRowToPostWithMeta, loadPostRowForDetail } from "@/lib/posts/map-post-detail-row";
import { loadCategoryLite } from "@/lib/posts/category-lite";
import { resolveServiceSegment } from "@/lib/posts/listing-service-segment";
import type { TradeAdProductRow } from "@/lib/trade-ads/load-trade-ad-product";
import {
  evaluateTradePostAdEligibility,
  TRADE_PAID_AD_FORMAT_GUIDE,
} from "@/lib/trade-ads/trade-post-ad-policy";

export const dynamic = "force-dynamic";

type ProductSummary = {
  id: string;
  name: string;
  description: string | null;
  placement: string | null;
  ad_type: string;
  duration_days: number;
  point_cost: number;
  priority_default: number;
  allow_duplicate: boolean;
  auto_approve: boolean;
  eligible: boolean;
  reason: string | null;
  checks: Array<{ key: string; pass: boolean; label: string; detail: string }>;
};

/**
 * GET /api/posts/[postId]/trade-ads/products — 상세(본인 글) 광고 신청용 상품·자격 조건
 */
export async function GET(_: Request, { params }: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const postId = (await params).postId?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 503 });
  }

  const row =
    (await loadPostRowForDetail(sb, POSTS_TABLE_READ, postId)) ??
    (await loadPostRowForDetail(sb, "posts", postId));
  if (!row) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }
  const ownerId = String((row as { user_id?: string }).user_id ?? "").trim();
  if (!ownerId || ownerId !== auth.userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 광고 신청할 수 있습니다." }, { status: 403 });
  }

  const post = mapPostDetailRowToPostWithMeta(row);
  const cat = await loadCategoryLite(sb, post.category_id ?? post.trade_category_id ?? null);
  const segment = resolveServiceSegment(post, cat);

  const { data: productRows, error: pe } = await sb
    .from("ad_products")
    .select(
      "id, name, description, board_key, ad_type, duration_days, point_cost, priority_default, is_active, placement, service_type, category_id, region_target, allow_duplicate, auto_approve"
    )
    .eq("is_active", true)
    .or("board_key.eq.trade,placement.eq.detail_bottom,placement.eq.list_top,placement.eq.home_featured,placement.eq.premium_all")
    .order("point_cost", { ascending: true })
    .limit(100);

  if (pe) {
    return NextResponse.json({ ok: false, error: pe.message }, { status: 500 });
  }

  const { data: existingRows } = await sb
    .from("trade_post_ads")
    .select("id, ad_product_id, apply_status")
    .eq("post_id", postId)
    .in("apply_status", ["pending", "approved", "active"])
    .limit(50);

  const existing = Array.isArray(existingRows) ? existingRows : [];
  const hasAnyExisting = existing.length > 0;
  const existingByProduct = new Set(
    existing
      .map((r) => String((r as { ad_product_id?: string | null }).ad_product_id ?? "").trim())
      .filter(Boolean)
  );

  const products: ProductSummary[] = (Array.isArray(productRows) ? productRows : []).map((raw) => {
    const p = raw as unknown as TradeAdProductRow;
    const evaluation = evaluateTradePostAdEligibility({
      post,
      product: p,
      serviceSegment: segment,
    });
    const duplicateDenied = hasAnyExisting && !p.allow_duplicate;
    const alreadyRequested = existingByProduct.has(p.id);
    const reason = duplicateDenied
      ? "이미 진행 중인 광고 신청이 있습니다."
      : alreadyRequested
        ? "동일 광고 상품 신청이 이미 진행 중입니다."
        : evaluation.blockingReason;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      placement: p.placement,
      ad_type: p.ad_type,
      duration_days: p.duration_days,
      point_cost: p.point_cost,
      priority_default: p.priority_default,
      allow_duplicate: p.allow_duplicate,
      auto_approve: p.auto_approve,
      eligible: !duplicateDenied && !alreadyRequested && evaluation.eligible,
      reason: reason ?? null,
      checks: evaluation.checks.map((c) => ({
        key: c.key,
        pass: c.pass,
        label: c.label,
        detail: c.detail,
      })),
    };
  });

  const topCheck =
    products.find((p) => !p.eligible && p.reason)?.reason ??
    "기본 조건을 충족하면 광고 상품을 신청할 수 있습니다.";

  return NextResponse.json({
    ok: true,
    formatGuide: TRADE_PAID_AD_FORMAT_GUIDE,
    criteriaSummary: topCheck,
    products,
    existingCount: existing.length,
  });
}
