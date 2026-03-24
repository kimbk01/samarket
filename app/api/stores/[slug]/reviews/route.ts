import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 공개 매장 리뷰 목록 (visible만) */
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
    return NextResponse.json({ ok: true, reviews: [], avg_rating: null, meta: { source: "supabase_unconfigured" } });
  }

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("id")
    .eq("slug", decoded)
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .maybeSingle();

  if (sErr || !store) {
    return NextResponse.json({ ok: true, reviews: [], avg_rating: null });
  }

  const { data: reviews, error } = await sb
    .from("store_reviews")
    .select("id, rating, content, created_at, product_id")
    .eq("store_id", store.id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("store_reviews") && error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, reviews: [], avg_rating: null, meta: { table_missing: true } });
    }
    console.error("[GET store reviews]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = reviews ?? [];
  const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
  const avg = list.length ? Math.round((sum / list.length) * 10) / 10 : null;

  return NextResponse.json({
    ok: true,
    reviews: list.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: r.content,
      created_at: r.created_at,
      product_id: r.product_id,
    })),
    avg_rating: avg,
    count: list.length,
  });
}
