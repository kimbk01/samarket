import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadOwnerStoreOrderReviewForOrder } from "@/lib/stores/owner-store-order-review-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {

  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveOwnerStoreOrderRow(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  storeId: string,
  orderIdOrNo: string
) {
  const byId = await sb
    .from("store_orders")
    .select("id, order_status")
    .eq("id", orderIdOrNo)
    .eq("store_id", storeId)
    .maybeSingle();
  if (byId.error) return { order: null as null, error: byId.error };
  if (byId.data) return { order: byId.data, error: null };

  const byNo = await sb
    .from("store_orders")
    .select("id, order_status")
    .eq("order_no", orderIdOrNo)
    .eq("store_id", storeId)
    .maybeSingle();
  if (byNo.error) return { order: null as null, error: byNo.error };
  return { order: byNo.data, error: null };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, id);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const orderId = req.nextUrl.searchParams.get("order_id")?.trim() ?? "";
  if (orderId) {
    const { order, error: orderErr } = await resolveOwnerStoreOrderRow(sb, id, orderId);
    if (orderErr) {
      return NextResponse.json({ ok: false, error: orderErr.message ?? "order_lookup_failed" }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
    }

    if (String(order.order_status ?? "") !== "completed") {
      return NextResponse.json({
        ok: true,
        review_status: "not_applicable" as const,
        review: null,
      });
    }

    const oid = String(order.id ?? "").trim();
    const { review, revErr } = await loadOwnerStoreOrderReviewForOrder(sb, oid);
    if (revErr) {
      if (revErr.message?.includes("store_reviews") && revErr.message.includes("does not exist")) {
        return NextResponse.json({
          ok: true,
          review_status: "unavailable" as const,
          review: null,
        });
      }
      console.error("[GET owner store review by order_id]", revErr);
    }

    return NextResponse.json({
      ok: true,
      review_status: review ? ("completed" as const) : ("pending" as const),
      review,
    });
  }

  const { data: rows, error } = await sb
    .from("store_reviews")
    .select(
      "id, order_id, product_id, buyer_user_id, rating, content, status, visible_to_public, image_urls, item_feedback, created_at, owner_reply_content, owner_reply_created_at"
    )
    .eq("store_id", id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    if (String(error.message || "").includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Record<string, unknown>[];
  const buyerIds = list.map((r) => String(r.buyer_user_id ?? "").trim()).filter(Boolean);
  const buyerMap = await mapBuyerUserIdsToPublicLabels(sb, buyerIds);

  return NextResponse.json({
    ok: true,
    reviews: list.map((r) => ({
      id: String(r.id ?? ""),
      order_id: String(r.order_id ?? ""),
      product_id: r.product_id ? String(r.product_id) : null,
      buyer_user_id: String(r.buyer_user_id ?? ""),
      buyer_public_label: buyerMap[String(r.buyer_user_id ?? "").trim()] ?? BUYER_PUBLIC_LABEL_FALLBACK,
      rating: Number(r.rating ?? 0),
      content: String(r.content ?? ""),
      status: String(r.status ?? ""),
      visible_to_public: r.visible_to_public !== false,
      image_urls: Array.isArray(r.image_urls)
        ? (r.image_urls as unknown[]).map((x) => String(x)).filter(Boolean)
        : [],
      item_feedback:
        r.item_feedback && typeof r.item_feedback === "object" && !Array.isArray(r.item_feedback)
          ? (r.item_feedback as Record<string, "up" | "down">)
          : null,
      created_at: String(r.created_at ?? ""),
      owner_reply_content:
        typeof r.owner_reply_content === "string" ? r.owner_reply_content : null,
      owner_reply_created_at:
        typeof r.owner_reply_created_at === "string" ? r.owner_reply_created_at : null,
    })),
  });
}
