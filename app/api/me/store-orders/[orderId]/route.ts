import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";
import {
  notifyStoreOwnerBuyerCancelled,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";
import { canBuyerRequestStoreRefund } from "@/lib/stores/order-status-transitions";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  appendOrderChatStatusTransition,
  ensureOrderChatRoom,
} from "@/lib/order-chat/service";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";

export const dynamic = "force-dynamic";

async function loadStoreOrderReviewMeta(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  orderId: string
): Promise<{
  reviewRow: { id?: string; visible_to_public?: boolean } | null;
  revErr: { message?: string } | null;
}> {
  let reviewRow: { id?: string; visible_to_public?: boolean } | null = null;
  let revErr: { message?: string } | null = null;
  const sel = await sb
    .from("store_reviews")
    .select("id, visible_to_public")
    .eq("order_id", orderId)
    .maybeSingle();
  reviewRow = sel.data as typeof reviewRow;
  revErr = sel.error;
  if (
    revErr &&
    /visible_to_public|column/i.test(String(revErr.message)) &&
    /does not exist/i.test(String(revErr.message))
  ) {
    const fb = await sb.from("store_reviews").select("id").eq("order_id", orderId).maybeSingle();
    reviewRow = fb.data ? { id: fb.data.id as string, visible_to_public: true } : null;
    revErr = fb.error;
  }
  return { reviewRow, revErr };
}

async function isBuyerHiddenStoreOrder(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  buyerUserId: string,
  orderId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("store_order_buyer_hides")
    .select("order_id")
    .eq("buyer_user_id", buyerUserId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("store_order_buyer_hides") && error.message.includes("does not exist")) {
      return false;
    }
    throw error;
  }
  return !!data;
}

/** 구매자: 주문 단건 + 라인 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, buyer_user_id, total_amount, discount_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, updated_at, auto_complete_at, community_messenger_room_id"
    )
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const hidden = await isBuyerHiddenStoreOrder(sb, buyerId, oid);
    if (hidden) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  } catch (hideErr) {
    console.error("[GET store-order hidden check]", hideErr);
    return NextResponse.json({ ok: false, error: "hidden_check_failed" }, { status: 500 });
  }

  const storeId = order.store_id as string;
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const [itemsRes, storeRes, reviewMeta, ens] = await Promise.all([
    sb
      .from("store_order_items")
      .select("id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
      .eq("order_id", oid)
      .order("id"),
    sb
      .from("stores")
      .select(
        "store_name, slug, owner_user_id, region, city, district, address_line1, address_line2"
      )
      .eq("id", storeId)
      .maybeSingle(),
    loadStoreOrderReviewMeta(sb, oid),
    (async () => {
      try {
        return await ensureOrderChatRoom(sbAny, oid);
      } catch {
        return { ok: false as const, error: "exception" };
      }
    })(),
  ]);

  const { data: items, error: iErr } = itemsRes;
  if (iErr) {
    console.error("[GET store-order items]", iErr);
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  }

  const { data: store } = storeRes;

  const store_pickup_address_lines =
    store ?
      formatStorePickupAddressLines({
        region: store.region as string | null | undefined,
        city: store.city as string | null | undefined,
        district: store.district as string | null | undefined,
        address_line1: store.address_line1 as string | null | undefined,
        address_line2: store.address_line2 as string | null | undefined,
      })
    : [];

  const { reviewRow, revErr } = reviewMeta;

  const completed = order.order_status === "completed";
  const reviewsUnavailable = !!(
    revErr?.message?.includes("store_reviews") && revErr.message.includes("does not exist")
  );
  const reviewId =
    !revErr && reviewRow?.id ? (reviewRow.id as string) : undefined;
  const reviewVisibleToPublic = reviewRow?.visible_to_public !== false;
  const canSubmitReview = completed && !reviewId && !reviewsUnavailable;

  let order_chat_ready = false;
  if (ens.ok) order_chat_ready = true;

  return NextResponse.json({
    ok: true,
    order: {
      ...order,
      store_name: (store?.store_name as string) ?? "",
      store_slug: (store?.slug as string) ?? "",
      owner_user_id: (store?.owner_user_id as string) ?? "",
      store_pickup_address_lines,
    },
    items: items ?? [],
    review: reviewId ? { id: reviewId, visible_to_public: reviewVisibleToPublic } : null,
    can_submit_review: canSubmitReview,
    order_chat_ready,
  });
}

type PatchBody = { cancel?: boolean; request_refund?: boolean; refund_reason?: string };

const REFUND_REASON_MAX = 500;

/**
 * 구매자: 접수 전 취소 | 진행 중 환불 요청
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.cancel && body.request_refund) {
    return NextResponse.json({ ok: false, error: "conflicting_actions" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, order_status, payment_status, store_id, order_no")
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const rm = getAuditRequestMeta(req);

  if (body.request_refund) {
    if (order.order_status === "refund_requested") {
      return NextResponse.json({ ok: true, order_status: "refund_requested" });
    }
    if (order.order_status === "refunded") {
      return NextResponse.json({ ok: true, order_status: "refunded" });
    }
    if (!canBuyerRequestStoreRefund(order.order_status as string, order.payment_status as string)) {
      return NextResponse.json({ ok: false, error: "cannot_request_refund" }, { status: 400 });
    }

    let reason = typeof body.refund_reason === "string" ? body.refund_reason.trim() : "";
    if (reason.length > REFUND_REASON_MAX) {
      reason = reason.slice(0, REFUND_REASON_MAX);
    }

    const patch: Record<string, unknown> = {
      order_status: "refund_requested",
      auto_complete_at: null,
    };
    let { error: uErr } = await sb.from("store_orders").update(patch).eq("id", oid).eq("buyer_user_id", buyerId);

    if (uErr?.message?.includes("auto_complete_at") && uErr.message.includes("does not exist")) {
      const { error: fb } = await sb
        .from("store_orders")
        .update({ order_status: "refund_requested" })
        .eq("id", oid)
        .eq("buyer_user_id", buyerId);
      uErr = fb ?? null;
    }

    if (uErr) {
      console.error("[PATCH store-order request_refund]", uErr);
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }

    void appendAuditLog(sb, {
      actor_type: "user",
      actor_id: buyerId,
      target_type: "store_order",
      target_id: oid,
      action: "store_order.buyer_refund_request",
      before_json: {
        order_status: order.order_status,
        payment_status: order.payment_status,
      },
      after_json: { order_status: "refund_requested", reason: reason || undefined },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });

    void notifyStoreOwnerRefundRequested(sb, {
      storeId: order.store_id as string,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
    });

    try {
      const { data: stRow } = await sb
        .from("stores")
        .select("owner_user_id")
        .eq("id", order.store_id as string)
        .maybeSingle();
      const ownerId = (stRow as { owner_user_id?: string } | null)?.owner_user_id;
      await appendOrderChatStatusTransition(
        sb as import("@supabase/supabase-js").SupabaseClient<any>,
        oid,
        order.order_status as string,
        "refund_requested"
      );
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, order_status: "refund_requested" });
  }

  if (!body.cancel) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }

  if (order.order_status === "cancelled") {
    return NextResponse.json({ ok: true, order_status: "cancelled" });
  }

  if (order.order_status !== "pending") {
    return NextResponse.json({ ok: false, error: "cannot_cancel_after_accepted" }, { status: 400 });
  }

  const { data: lines, error: iErr } = await sb
    .from("store_order_items")
    .select("product_id, qty")
    .eq("order_id", oid);

  if (iErr) {
    console.error("[PATCH store-order cancel] items", iErr);
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  }

  await restoreStockForOrderLines(
    sb,
    (lines ?? []).map((r) => ({
      product_id: r.product_id as string,
      qty: r.qty as number,
    }))
  );

  const { error: uErr } = await sb
    .from("store_orders")
    .update({
      order_status: "cancelled",
      payment_status: "cancelled",
    })
    .eq("id", oid)
    .eq("buyer_user_id", buyerId);

  if (uErr) {
    console.error("[PATCH store-order cancel]", uErr);
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: buyerId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.buyer_cancel",
    before_json: {
      order_status: order.order_status,
      payment_status: order.payment_status,
    },
    after_json: { order_status: "cancelled", payment_status: "cancelled" },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  void notifyStoreOwnerBuyerCancelled(sb, {
    storeId: order.store_id as string,
    orderId: oid,
    orderNo: String(order.order_no ?? ""),
  });

  let cancelOwnerId: string | null = null;
  try {
    const { data: stRow2 } = await sb
      .from("stores")
      .select("owner_user_id")
      .eq("id", order.store_id as string)
      .maybeSingle();
    const ownerId2 = (stRow2 as { owner_user_id?: string } | null)?.owner_user_id;
    cancelOwnerId = ownerId2 ? String(ownerId2) : null;
    await appendOrderChatStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      order.order_status as string,
      "cancelled"
    );
  } catch {
    /* ignore */
  }

  invalidateStoreOrderCountsCache(order.store_id as string);
  if (cancelOwnerId) invalidateOwnerHubBadgeCache(cancelOwnerId);

  return NextResponse.json({ ok: true, order_status: "cancelled", payment_status: "cancelled" });
}

/**
 * 구매자: 주문 내역 숨김(본인 목록에서만 삭제)
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id")
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();
  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { error: hideErr } = await sb.from("store_order_buyer_hides").upsert(
    {
      order_id: oid,
      buyer_user_id: buyerId,
      hidden_at: new Date().toISOString(),
    },
    { onConflict: "order_id,buyer_user_id" }
  );
  if (hideErr) {
    if (hideErr.message?.includes("store_order_buyer_hides") && hideErr.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "buyer_hide_schema_missing" }, { status: 503 });
    }
    console.error("[DELETE store-order hide]", hideErr);
    return NextResponse.json({ ok: false, error: hideErr.message }, { status: 500 });
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: buyerId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.buyer_hide",
    after_json: { hidden: true },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, hidden: true });
}
