import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { mapPostDetailRowToPostWithMeta, loadPostRowForDetail } from "@/lib/posts/map-post-detail-row";
import { loadCategoryLite } from "@/lib/posts/category-lite";
import { resolveServiceSegment } from "@/lib/posts/listing-service-segment";
import { loadTradeAdProductById } from "@/lib/trade-ads/load-trade-ad-product";
import { holdPointsForTradePostAdApply } from "@/lib/trade-ads/trade-post-ad-point-flow";
import { evaluateTradePostAdEligibility } from "@/lib/trade-ads/trade-post-ad-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { ad_product_id?: string };

/**
 * POST /api/posts/[postId]/trade-ads/apply — 판매자 거래 광고 신청(보류 포인트).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const postId = (await params).postId?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const adProductId = body.ad_product_id?.trim() ?? "";
  if (!adProductId) {
    return NextResponse.json({ ok: false, error: "ad_product_id 필요" }, { status: 400 });
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

  const userId = String((row as { user_id?: string }).user_id ?? "").trim();
  if (!userId || userId !== auth.userId) {
    return NextResponse.json({ ok: false, error: "본인 상품만 광고 신청할 수 있습니다." }, { status: 403 });
  }

  const post = mapPostDetailRowToPostWithMeta(row);
  if (post.type === "community") {
    return NextResponse.json({ ok: false, error: "거래 글이 아닙니다." }, { status: 400 });
  }

  const cat = await loadCategoryLite(sb, post.category_id ?? post.trade_category_id ?? null);
  const segment = resolveServiceSegment(post, cat);

  const product = await loadTradeAdProductById(sb, adProductId);
  if (!product || !product.is_active) {
    return NextResponse.json({ ok: false, error: "유효한 광고 상품이 아닙니다." }, { status: 400 });
  }

  const eligibility = evaluateTradePostAdEligibility({
    post,
    product,
    serviceSegment: segment,
  });
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        ok: false,
        error: eligibility.blockingReason ?? "광고 신청 기준을 충족하지 않습니다.",
        checks: eligibility.checks,
      },
      { status: 400 }
    );
  }

  const { data: existing } = await sb
    .from("trade_post_ads")
    .select("id")
    .eq("post_id", postId)
    .in("apply_status", ["pending", "approved", "active"])
    .limit(3);

  if (Array.isArray(existing) && existing.length > 0) {
    if (!product.allow_duplicate && existing.length > 0) {
      return NextResponse.json({ ok: false, error: "이미 진행 중인 광고 신청이 있습니다." }, { status: 409 });
    }
  }

  const pointCost = product.point_cost;
  const priority = product.priority_default;

  const { data: inserted, error: insE } = await sb
    .from("trade_post_ads")
    .insert({
      post_id: postId,
      user_id: auth.userId,
      ad_product_id: adProductId,
      apply_status: "pending",
      point_cost: pointCost,
      priority,
    })
    .select("id")
    .maybeSingle();

  if (insE || !inserted || typeof inserted !== "object") {
    return NextResponse.json({ ok: false, error: insE?.message ?? "신청 생성 실패" }, { status: 500 });
  }

  const tradeAdId = String((inserted as { id?: string }).id ?? "");
  if (!tradeAdId) {
    return NextResponse.json({ ok: false, error: "신청 ID 오류" }, { status: 500 });
  }

  const hold = await holdPointsForTradePostAdApply(sb, {
    userId: auth.userId,
    tradePostAdId: tradeAdId,
    pointCost,
  });
  if (!hold.ok) {
    await sb.from("trade_post_ads").delete().eq("id", tradeAdId);
    return NextResponse.json({ ok: false, error: hold.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: tradeAdId });
}
