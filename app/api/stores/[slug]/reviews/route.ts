import { NextResponse } from "next/server";
import {
  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";
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

  let reviews: Record<string, unknown>[] | null = null;
  let error: { message?: string } | null = null;
  {
    const sel = await sb
      .from("store_reviews")
      .select(
        "id, rating, content, created_at, product_id, image_urls, visible_to_public, item_feedback, buyer_user_id, owner_reply_content, owner_reply_created_at"
      )
      .eq("store_id", store.id)
      .eq("status", "visible")
      .eq("visible_to_public", true)
      .order("created_at", { ascending: false })
      .limit(50);
    reviews = sel.data as Record<string, unknown>[] | null;
    error = sel.error;
    if (
      error &&
      String(error.message).toLowerCase().includes("column") &&
      String(error.message).toLowerCase().includes("does not exist")
    ) {
      const fb = await sb
        .from("store_reviews")
        .select("id, rating, content, created_at, product_id, buyer_user_id")
        .eq("store_id", store.id)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(50);
      reviews = fb.data as Record<string, unknown>[] | null;
      error = fb.error;
    }
  }

  if (error) {
    if (error.message?.includes("store_reviews") && error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, reviews: [], avg_rating: null, meta: { table_missing: true } });
    }
    console.error("[GET store reviews]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = (reviews ?? []).filter((r) => r.visible_to_public !== false);
  const buyerIds = list.map((r) => String(r.buyer_user_id ?? "").trim()).filter(Boolean);
  const buyerMap = await mapBuyerUserIdsToPublicLabels(sb, buyerIds);
  const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
  const avg = list.length ? Math.round((sum / list.length) * 10) / 10 : null;

  return NextResponse.json({
    ok: true,
    reviews: list.map((r) => {
      const imgs = Array.isArray(r.image_urls) ? (r.image_urls as unknown[]).map((x) => String(x)).filter(Boolean) : [];
      return {
        id: r.id,
        rating: r.rating,
        content: r.content,
        created_at: r.created_at,
        product_id: r.product_id,
        buyer_public_label:
          buyerMap[String(r.buyer_user_id ?? "").trim()] ?? BUYER_PUBLIC_LABEL_FALLBACK,
        image_urls: imgs.slice(0, 5),
        owner_reply_content:
          typeof r.owner_reply_content === "string" ? r.owner_reply_content : null,
        owner_reply_created_at:
          typeof r.owner_reply_created_at === "string" ? r.owner_reply_created_at : null,
      };
    }),
    avg_rating: avg,
    count: list.length,
  });
}
