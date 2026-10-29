import { NextResponse } from "next/server";
import {
  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";
import { getApprovedStoreBySlug, STORE_SELECT_ID_SLUG_GATE } from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isStoreDetailViewerBlocked, storeDetailLoginRequiredResponse } from "@/lib/stores/store-detail-api-gate";
import { STORE_PUBLIC_API_ERROR_CODES } from "@/lib/stores/store-public-api-error-codes";
import { REVIEW_RATING_BUCKETS, summarizeReviewRatingCounts } from "@/lib/stores/store-review-rating-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_PREVIEW_MAX = 160;

type ReviewRow = Record<string, unknown>;

function trimContent(s: unknown): string {
  const t = typeof s === "string" ? s.trim() : "";
  if (t.length <= CONTENT_PREVIEW_MAX) return t;
  return `${t.slice(0, CONTENT_PREVIEW_MAX - 1)}…`;
}

/**
 * 리뷰 평균·최근 3건·분포 — 전체 목록은 `GET /api/stores/:slug/reviews` 유지.
 * distribution은 전체 리뷰를 별점별 COUNT 로 DB 측 집계 (50건 제한 없음, v4 PERF-11).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      avg_rating: null,
      count: 0,
      recent: [] as unknown[],
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      meta: { source: "supabase_unconfigured" as const },
    });
  }

  try {
    /** v4 API-14 — 상세 계열 비로그인 게이트. 인증·slug 조회 병렬 (PERF-11) */
    const [viewerId, storeRes] = await Promise.all([
      getRouteUserId(),
      getApprovedStoreBySlug(sb, decoded, STORE_SELECT_ID_SLUG_GATE),
    ]);
    if (isStoreDetailViewerBlocked(viewerId)) {
      return storeDetailLoginRequiredResponse({
        avg_rating: null,
        count: 0,
        recent: [],
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    }
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug/reviews-summary] store", storeRes.message);
        return NextResponse.json(
          { ok: false, error: STORE_PUBLIC_API_ERROR_CODES.reviewsSummary },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        avg_rating: null,
        count: 0,
        recent: [],
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        meta: { source: "supabase" as const },
      });
    }

    const storeId = String(storeRes.store.id ?? "");

    /**
     * v4 PERF-11 — 분포·평균은 DB 측 COUNT(별점 1~5, `rating` CHECK 1..5 smallint)로 집계하고
     * 최근 3건 조회와 한 번에 병렬 실행 (전체 행 JS 집계·직렬 2단 제거). 왕복 1단.
     */
    const visibleReviews = () =>
      sb
        .from("store_reviews")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "visible")
        .eq("visible_to_public", true);
    const [countResults, recentSel] = await Promise.all([
      Promise.all(REVIEW_RATING_BUCKETS.map((n) => visibleReviews().eq("rating", n))),
      sb
        .from("store_reviews")
        .select(
          "id, rating, content, created_at, buyer_user_id, owner_reply_content, owner_reply_created_at"
        )
        .eq("store_id", storeId)
        .eq("status", "visible")
        .eq("visible_to_public", true)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const aggErr = countResults.find((r) => r.error)?.error ?? null;
    if (aggErr) {
      if (aggErr.message?.includes("store_reviews") && aggErr.message?.includes("does not exist")) {
        return NextResponse.json({
          ok: true,
          avg_rating: null,
          count: 0,
          recent: [],
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          meta: { table_missing: true as const },
        });
      }
      console.error("[GET store reviews-summary] aggErr", aggErr);
    }
    const { distribution, totalCount, avgRating } = aggErr
      ? { distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>, totalCount: 0, avgRating: null }
      : summarizeReviewRatingCounts(countResults.map((r) => r.count ?? 0));
    const recentRows = recentSel.data as ReviewRow[] | null;

    const list = recentRows ?? [];
    const buyerIds = list.map((r) => String(r.buyer_user_id ?? "").trim()).filter(Boolean);
    const buyerMap = await mapBuyerUserIdsToPublicLabels(sb, buyerIds);

    const recent = list.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: trimContent(r.content),
      created_at: r.created_at,
      buyer_public_label:
        buyerMap[String(r.buyer_user_id ?? "").trim()] ?? BUYER_PUBLIC_LABEL_FALLBACK,
    }));

    return NextResponse.json({
      ok: true,
      avg_rating: avgRating,
      count: totalCount,
      recent,
      distribution,
      meta: { source: "supabase" as const },
    });
  } catch (e) {
    console.error("[api/stores/slug/reviews-summary]", e);
    return NextResponse.json(
      { ok: false, error: STORE_PUBLIC_API_ERROR_CODES.reviewsSummary },
      { status: 500 }
    );
  }
}
