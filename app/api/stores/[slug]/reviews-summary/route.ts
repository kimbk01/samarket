import { NextResponse } from "next/server";
import {
  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";
import { getApprovedStoreBySlug, STORE_SELECT_ID_SLUG_GATE } from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

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
 * distribution은 전체 리뷰를 COUNT/GROUP BY로 집계 (50건 제한 없음).
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
    const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_ID_SLUG_GATE);
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug/reviews-summary] store", storeRes.message);
        return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
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

    // 전체 분포/집계: rating만 조회해 COUNT (50건 제한 없음)
    const { data: allRatings, error: aggErr } = await sb
      .from("store_reviews")
      .select("rating")
      .eq("store_id", storeId)
      .eq("status", "visible")
      .eq("visible_to_public", true);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalCount = 0;
    let avgRating: number | null = null;

    if (!aggErr && Array.isArray(allRatings) && allRatings.length > 0) {
      let sum = 0;
      for (const row of allRatings) {
        const n = Math.min(5, Math.max(1, Math.floor(Number(row.rating) || 0))) as 1 | 2 | 3 | 4 | 5;
        distribution[n] += 1;
        sum += n;
      }
      totalCount = allRatings.length;
      avgRating = Math.round((sum / totalCount) * 10) / 10;
    } else if (aggErr) {
      // 컬럼 오류면 table_missing으로 처리
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

    // 최근 3건: 리뷰 본문·작성자 표시용
    let recentRows: ReviewRow[] | null = null;
    {
      const sel = await sb
        .from("store_reviews")
        .select(
          "id, rating, content, created_at, buyer_user_id, owner_reply_content, owner_reply_created_at"
        )
        .eq("store_id", storeId)
        .eq("status", "visible")
        .eq("visible_to_public", true)
        .order("created_at", { ascending: false })
        .limit(3);
      recentRows = sel.data as ReviewRow[] | null;
    }

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
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
