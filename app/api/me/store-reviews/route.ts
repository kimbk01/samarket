import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

type PostBody = {
  order_id?: string;
  rating?: number;
  content?: string;
  product_id?: string | null;
};

/**
 * 구매자: 완료된 주문에 대한 리뷰 1건 등록 (주문당 1회)
 */
export async function POST(req: NextRequest) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderId = String(body.order_id ?? "").trim();
  const rating = Math.round(Number(body.rating));
  const content = String(body.content ?? "").trim();
  const productIdRaw = body.product_id != null ? String(body.product_id).trim() : "";

  if (!orderId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "invalid_rating_or_order" }, { status: 400 });
  }
  if (!content || content.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_content" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }
  if (order.buyer_user_id !== buyerId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (order.order_status !== "completed") {
    return NextResponse.json({ ok: false, error: "order_not_completed" }, { status: 400 });
  }

  const { data: existing } = await sb.from("store_reviews").select("id").eq("order_id", orderId).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, error: "review_already_exists" }, { status: 409 });
  }

  let productId: string | null = null;
  if (productIdRaw) {
    const { data: line } = await sb
      .from("store_order_items")
      .select("product_id")
      .eq("order_id", orderId)
      .eq("product_id", productIdRaw)
      .maybeSingle();
    if (!line) {
      return NextResponse.json({ ok: false, error: "product_not_in_order" }, { status: 400 });
    }
    productId = productIdRaw;
  }

  const { data: row, error: insErr } = await sb
    .from("store_reviews")
    .insert({
      order_id: orderId,
      store_id: order.store_id,
      product_id: productId,
      buyer_user_id: buyerId,
      rating,
      content,
      status: "visible",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.message?.includes("store_reviews") && insErr.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "store_reviews_table_missing" }, { status: 503 });
    }
    console.error("[POST store-reviews]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row?.id });
}
