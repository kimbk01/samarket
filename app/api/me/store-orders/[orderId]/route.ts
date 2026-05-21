import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";
import {
  notifyStoreOwnerBuyerCancelled,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";
import {
  buildStoreOrderEventDedupeKey,
  createStoreOrderEvent,
} from "@/lib/stores/store-order-events";
import { canBuyerRequestStoreRefund } from "@/lib/stores/order-status-transitions";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { appendStoreOrderMessengerStatusTransition } from "@/lib/community-messenger/store-order-chat-service";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import {
  loadBuyerStoreOrderReviewForOrder,
  mapBuyerStoreOrderReviewRow,
} from "@/lib/stores/buyer-store-order-review-meta";
import { fetchBuyerStoreOrderDetailSnapshot } from "@/lib/stores/fetch-store-order-detail-snapshot-rpc";
import {
  jsonPayloadKb,
  logStoreOrderDetailPerf,
  perfNowMs,
} from "@/lib/stores/store-order-detail-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadDeliverySnapshot(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  orderId: string
): Promise<
  | {
      ok: true;
      delivery: Record<string, unknown> | null;
    }
  | { ok: false; error: string }
> {
  const { data, error } = await sb
    .from("store_order_deliveries")
    .select(
      "order_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, rider_accepted_at, customer_arrived_at, rider_decline_reason, delivered_confirmed_at, delivered_receiver_name, updated_at"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    if (/store_order_deliveries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return { ok: true, delivery: null };
    }
    console.error("[GET store-order delivery]", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, delivery: (data as Record<string, unknown>) ?? null };
}

/** 구매자 노출: 증빙 이미지 URL 제외·수령자 이름 마스킹 */
function sanitizeBuyerDeliveryPublic(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return null;
  const name =
    typeof raw.delivered_receiver_name === "string" ? raw.delivered_receiver_name.trim() : "";
  const hint =
    name.length === 0 ? null : name.length <= 2 ? `${name.slice(0, 1)}*` : `${name.slice(0, 1)}**`;
  const { delivered_receiver_name: _drop, ...rest } = raw;
  return {
    ...rest,
    delivered_receiver_hint: hint,
  };
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

/** 구매자: 주문 단건 + 라인 — read-only (ensure/summary → POST ensure-chat·주문 생성·채팅 진입) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const wall0 = perfNowMs();
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

  const tAuth0 = perfNowMs();
  const [session, snapshotGate] = await Promise.all([
    validateActiveSession(buyerId),
    fetchBuyerStoreOrderDetailSnapshot(sb as import("@supabase/supabase-js").SupabaseClient<any>, buyerId, oid),
  ]);
  const auth_ms = Math.round(perfNowMs() - tAuth0);
  if (!session.ok) return session.response;

  if (snapshotGate) {
    if (!snapshotGate.ok) {
      return NextResponse.json({ ok: false, error: snapshotGate.error }, { status: snapshotGate.status });
    }
    const order = snapshotGate.order;
    const store = snapshotGate.store;
    const linkedRoomId =
      typeof order.community_messenger_room_id === "string" ? order.community_messenger_room_id.trim() : "";
    const room_id_exists: 0 | 1 = linkedRoomId ? 1 : 0;
    const store_pickup_address_lines = formatStorePickupAddressLines({
      region: store.region as string | null | undefined,
      city: store.city as string | null | undefined,
      district: store.district as string | null | undefined,
      address_line1: store.address_line1 as string | null | undefined,
      address_line2: store.address_line2 as string | null | undefined,
    });
    const buyerReview = mapBuyerStoreOrderReviewRow(snapshotGate.review);
    const completed = order.order_status === "completed";
    const reviewsUnavailable = false;
    const canSubmitReview = completed && !buyerReview && !reviewsUnavailable;
    const order_chat_ready = room_id_exists === 1;
    const body = {
      ok: true as const,
      order: {
        ...order,
        store_name: (store.store_name as string) ?? "",
        store_slug: (store.slug as string) ?? "",
        owner_user_id: (store.owner_user_id as string) ?? "",
        store_pickup_address_lines,
      },
      items: snapshotGate.items,
      delivery: snapshotGate.delivery ? sanitizeBuyerDeliveryPublic(snapshotGate.delivery) : null,
      review: buyerReview,
      review_status: completed
        ? buyerReview
          ? "completed"
          : reviewsUnavailable
            ? "unavailable"
            : "pending"
        : "not_applicable",
      can_submit_review: canSubmitReview,
      order_chat_ready,
    };
    logStoreOrderDetailPerf({
      route: "buyer_get",
      auth_ms,
      order_fetch_ms: snapshotGate.rpc_wall_ms,
      items_fetch_ms: 0,
      review_meta_ms: 0,
      delivery_snapshot_ms: 0,
      ensure_room_ms: 0,
      append_summary_ms: 0,
      participant_upsert_ms: 0,
      room_update_ms: 0,
      unread_sync_ms: 0,
      total_ms: Math.round(perfNowMs() - wall0),
      payload_kb: jsonPayloadKb(body),
      room_id_exists,
      ensure_skipped: 1,
      summary_skipped: 1,
      snapshot_via: "rpc_snapshot",
      db_round_trips: 1,
      rpc_wall_ms: snapshotGate.rpc_wall_ms,
    });
    return NextResponse.json(body);
  }

  const tOrder0 = perfNowMs();
  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, buyer_user_id, total_amount, discount_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, admin_locked, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters"
    )
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();
  const order_fetch_ms = Math.round(perfNowMs() - tOrder0);

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
  const linkedRoomId =
    typeof order.community_messenger_room_id === "string"
      ? order.community_messenger_room_id.trim()
      : "";
  const room_id_exists: 0 | 1 = linkedRoomId ? 1 : 0;

  const tItems0 = perfNowMs();
  const itemsPromise = sb
    .from("store_order_items")
    .select("id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
    .eq("order_id", oid)
    .order("id")
    .then((r) => ({ r, ms: Math.round(perfNowMs() - tItems0) }));

  const tStore0 = perfNowMs();
  const storePromise = sb
    .from("stores")
    .select("store_name, slug, owner_user_id, region, city, district, address_line1, address_line2")
    .eq("id", storeId)
    .maybeSingle()
    .then((r) => ({ r, ms: Math.round(perfNowMs() - tStore0) }));

  const tReview0 = perfNowMs();
  const reviewPromise = loadBuyerStoreOrderReviewForOrder(sbAny, oid).then((r) => ({
    r,
    ms: Math.round(perfNowMs() - tReview0),
  }));

  const tDelivery0 = perfNowMs();
  const deliveryPromise = loadDeliverySnapshot(sbAny, oid).then((r) => ({
    r,
    ms: Math.round(perfNowMs() - tDelivery0),
  }));

  const [{ r: itemsRes, ms: items_fetch_ms }, { r: storeRes }, { r: reviewMeta, ms: review_meta_ms }, { r: deliverySnap, ms: delivery_snapshot_ms }] =
    await Promise.all([itemsPromise, storePromise, reviewPromise, deliveryPromise]);

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

  const { review: buyerReview, revErr } = reviewMeta;

  const completed = order.order_status === "completed";
  const reviewsUnavailable = !!(
    revErr?.message?.includes("store_reviews") && revErr.message.includes("does not exist")
  );
  const canSubmitReview = completed && !buyerReview && !reviewsUnavailable;

  const order_chat_ready = room_id_exists === 1;

  const body = {
    ok: true as const,
    order: {
      ...order,
      store_name: (store?.store_name as string) ?? "",
      store_slug: (store?.slug as string) ?? "",
      owner_user_id: (store?.owner_user_id as string) ?? "",
      store_pickup_address_lines,
    },
    items: items ?? [],
    delivery: deliverySnap.ok ? sanitizeBuyerDeliveryPublic(deliverySnap.delivery) : null,
    review: buyerReview,
    review_status: completed
      ? buyerReview
        ? "completed"
        : reviewsUnavailable
          ? "unavailable"
          : "pending"
      : "not_applicable",
    can_submit_review: canSubmitReview,
    order_chat_ready,
  };

  logStoreOrderDetailPerf({
    route: "buyer_get",
    auth_ms,
    order_fetch_ms,
    items_fetch_ms,
    review_meta_ms,
    delivery_snapshot_ms,
    ensure_room_ms: 0,
    append_summary_ms: 0,
    participant_upsert_ms: 0,
    room_update_ms: 0,
    unread_sync_ms: 0,
    total_ms: Math.round(perfNowMs() - wall0),
    payload_kb: jsonPayloadKb(body),
    room_id_exists,
    ensure_skipped: 1,
    summary_skipped: 1,
    snapshot_via: "legacy_parallel",
    db_round_trips: 5,
  });

  return NextResponse.json(body);
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
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;

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
    .select("id, order_status, payment_status, store_id, order_no, admin_locked")
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if ((order as { admin_locked?: boolean }).admin_locked === true) {
    return NextResponse.json({ ok: false, error: "order_admin_locked" }, { status: 409 });
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

    const refundEv = await createStoreOrderEvent(sb, {
      orderId: oid,
      storeId: order.store_id as string,
      actorUserId: buyerId,
      actorRole: "buyer",
      eventType: "refund_requested",
      fromStatus: order.order_status as string,
      toStatus: "refund_requested",
      dedupeKey: buildStoreOrderEventDedupeKey({
        orderId: oid,
        eventType: "refund_requested",
        toStatus: "refund_requested",
        actorUserId: buyerId,
      }),
      metadata: { reason: reason || undefined },
    });
    const refundNotify = {
      storeId: order.store_id as string,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
    };
    if (refundEv.ok) {
      if (refundEv.inserted) {
        void notifyStoreOwnerRefundRequested(sb, { ...refundNotify, storeOrderEventId: refundEv.row.id });
      }
    } else {
      void notifyStoreOwnerRefundRequested(sb, refundNotify);
    }

    try {
      const { data: stRow } = await sb
        .from("stores")
        .select("owner_user_id")
        .eq("id", order.store_id as string)
        .maybeSingle();
      const ownerId = (stRow as { owner_user_id?: string } | null)?.owner_user_id;
      await appendStoreOrderMessengerStatusTransition(
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

  const cancelEv = await createStoreOrderEvent(sb, {
    orderId: oid,
    storeId: order.store_id as string,
    actorUserId: buyerId,
    actorRole: "buyer",
    eventType: "order_cancelled",
    fromStatus: order.order_status as string,
    toStatus: "cancelled",
    dedupeKey: buildStoreOrderEventDedupeKey({
      orderId: oid,
      eventType: "order_cancelled",
      toStatus: "cancelled",
      actorUserId: buyerId,
    }),
    metadata: { payment_status: "cancelled" },
  });
  const cancelNotify = {
    storeId: order.store_id as string,
    orderId: oid,
    orderNo: String(order.order_no ?? ""),
  };
  if (cancelEv.ok) {
    if (cancelEv.inserted) {
      void notifyStoreOwnerBuyerCancelled(sb, { ...cancelNotify, storeOrderEventId: cancelEv.row.id });
    }
  } else {
    void notifyStoreOwnerBuyerCancelled(sb, cancelNotify);
  }

  let cancelOwnerId: string | null = null;
  try {
    const { data: stRow2 } = await sb
      .from("stores")
      .select("owner_user_id")
      .eq("id", order.store_id as string)
      .maybeSingle();
    const ownerId2 = (stRow2 as { owner_user_id?: string } | null)?.owner_user_id;
    cancelOwnerId = ownerId2 ? String(ownerId2) : null;
    await appendStoreOrderMessengerStatusTransition(
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
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;

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
