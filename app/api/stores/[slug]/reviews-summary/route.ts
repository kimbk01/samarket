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

    let reviews: ReviewRow[] | null = null;
    let error: { message?: string } | null = null;
    {
      const sel = await sb
        .from("store_reviews")
        .select(
          "id, rating, content, created_at, product_id, image_urls, visible_to_public, item_feedback, buyer_user_id, owner_reply_content, owner_reply_created_at"
        )
        .eq("store_id", storeId)
        .eq("status", "visible")
        .eq("visible_to_public", true)
        .order("created_at", { ascending: false })
        .limit(50);
      reviews = sel.data as ReviewRow[] | null;
      error = sel.error;
      if (
        error &&
        String(error.message).toLowerCase().includes("column") &&
        String(error.message).toLowerCase().includes("does not exist")
      ) {
        const fb = await sb
          .from("store_reviews")
          .select("id, rating, content, created_at, product_id, buyer_user_id")
          .eq("store_id", storeId)
          .eq("status", "visible")
          .order("created_at", { ascending: false })
          .limit(50);
        reviews = fb.data as ReviewRow[] | null;
        error = fb.error;
      }
    }

    if (error) {
      if (error.message?.includes("store_reviews") && error.message?.includes("does not exist")) {
        return NextResponse.json({
          ok: true,
          avg_rating: null,
          count: 0,
          recent: [],
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          meta: { table_missing: true as const },
        });
      }
      console.error("[GET store reviews-summary]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const list = (reviews ?? []).filter((r) => r.visible_to_public !== false);
    const buyerIds = list.map((r) => String(r.buyer_user_id ?? "").trim()).filter(Boolean);
    const buyerMap = await mapBuyerUserIdsToPublicLabels(sb, buyerIds);
    const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
    const avg = list.length ? Math.round((sum / list.length) * 10) / 10 : null;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of list) {
      const n = Math.min(5, Math.max(1, Math.floor(Number(r.rating) || 0)));
      if (n >= 1 && n <= 5) distribution[n as 1 | 2 | 3 | 4 | 5] += 1;
    }

    const recentRaw = list.slice(0, 3);
    const recent = recentRaw.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: trimContent(r.content),
      created_at: r.created_at,
      buyer_public_label:
        buyerMap[String(r.buyer_user_id ?? "").trim()] ?? BUYER_PUBLIC_LABEL_FALLBACK,
    }));

    return NextResponse.json({
      ok: true,
      avg_rating: avg,
      count: list.length,
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
