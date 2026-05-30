import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadOwnerStoreOrderReviewForOrder } from "@/lib/stores/owner-store-order-review-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 주문 1건에 연결된 고객 리뷰(별점·본문·메뉴 평가·사진·사장님 댓글). */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string; orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId, orderId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!sid || !oid) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: order, error: orderErr } = await sb
    .from("store_orders")
    .select("id, order_status")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (orderErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const orderStatus = String(order.order_status ?? "");
  if (orderStatus !== "completed") {
    return NextResponse.json({
      ok: true,
      review_status: "not_applicable" as const,
      review: null,
    });
  }

  const { review, revErr } = await loadOwnerStoreOrderReviewForOrder(sb, oid);
  if (revErr) {
    if (revErr.message?.includes("store_reviews") && revErr.message.includes("does not exist")) {
      return NextResponse.json({
        ok: true,
        review_status: "unavailable" as const,
        review: null,
      });
    }
    return NextResponse.json({ ok: false, error: revErr.message ?? "review_load_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    review_status: review ? ("completed" as const) : ("pending" as const),
    review,
  });
}
