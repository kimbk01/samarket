import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { ownerAcceptRequiresRecordedPayment } from "@/lib/stores/owner-order-payment-policy";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { fetchOwnerStoreOrderDetailSnapshot } from "@/lib/stores/fetch-store-order-detail-snapshot-rpc";
import { isValidOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { loadOwnerStoreOrderReviewForOrder } from "@/lib/stores/owner-store-order-review-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";
import { deleteOwnerStoreOrdersListSnapshotCounter } from "@/lib/stores/owner-store-orders-list-snapshot";
import {
  jsonPayloadKb,
  logStoreOrderDetailPerf,
  perfNowMs,
} from "@/lib/stores/store-order-detail-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { order_status?: string; estimated_prep_minutes?: number };

async function loadDeliverySnapshot(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  orderId: string
): Promise<
  | {
      ok: true;
      delivery: {
        order_id: string;
        rider_id: string | null;
        delivery_status: string;
        assigned_at: string | null;
        picked_up_at: string | null;
        delivered_at: string | null;
        admin_note: string | null;
        rider_accepted_at: string | null;
        customer_arrived_at: string | null;
        rider_decline_reason: string | null;
        rider_failure_reported_at: string | null;
        rider_failure_report_reason: string | null;
        updated_at: string | null;
      } | null;
    }
  | { ok: false; error: string }
> {
  const { data, error } = await sb
    .from("store_order_deliveries")
    .select(
      "order_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, admin_note, rider_accepted_at, customer_arrived_at, rider_decline_reason, rider_failure_reported_at, rider_failure_report_reason, updated_at"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    if (/store_order_deliveries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return { ok: true, delivery: null };
    }
    console.error("[GET owner store-order delivery]", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, delivery: (data as any) ?? null };
}

async function loadOwnerOrderReviewStatus(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  orderId: string,
  orderStatus: string
): Promise<"not_applicable" | "pending" | "completed" | "unavailable"> {
  if (orderStatus !== "completed") return "not_applicable";
  const { data, error } = await sb
    .from("store_reviews")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("store_reviews") && error.message.includes("does not exist")) {
      return "unavailable";
    }
    console.error("[GET owner store-order review]", error);
    return "unavailable";
  }
  return data?.id ? "completed" : "pending";
}

async function loadOwnerOrderReviewDetail(
  sb: import("@supabase/supabase-js").SupabaseClient<any>,
  orderId: string,
  orderStatus: string,
  reviewStatus: string
) {
  if (orderStatus !== "completed" || reviewStatus === "unavailable" || reviewStatus === "pending") {
    return null;
  }
  const { review, revErr } = await loadOwnerStoreOrderReviewForOrder(sb, orderId);
  if (revErr) {
    console.error("[GET owner store-order review detail]", revErr);
    return null;
  }
  return review;
}

/** 매장 오너: 단일 주문 + 라인 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string; orderId: string }> }
) {
  const wall0 = perfNowMs();
  const tAuth0 = perfNowMs();
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const auth_ms = Math.round(perfNowMs() - tAuth0);

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

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const snapshotGate = await fetchOwnerStoreOrderDetailSnapshot(sbAny, userId, sid, oid);
  if (snapshotGate) {
    if (!snapshotGate.ok) {
      return NextResponse.json({ ok: false, error: snapshotGate.error }, { status: snapshotGate.status });
    }
    const storeRow = snapshotGate.store;
    const order = snapshotGate.order;
    const store_pickup_address_lines = formatStorePickupAddressLines({
      region: storeRow.region as string | null | undefined,
      city: storeRow.city as string | null | undefined,
      district: storeRow.district as string | null | undefined,
      address_line1: storeRow.address_line1 as string | null | undefined,
      address_line2: storeRow.address_line2 as string | null | undefined,
    });
    const room_id_exists: 0 | 1 =
      typeof order.community_messenger_room_id === "string" && order.community_messenger_room_id.trim()
        ? 1
        : 0;
    const order_chat_ready = room_id_exists === 1;
    const review = await loadOwnerOrderReviewDetail(
      sbAny,
      oid,
      String(order.order_status ?? ""),
      snapshotGate.review_status
    );
    const body = {
      ok: true as const,
      meta: {
        owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
        owner_user_id: userId,
        store_name: (storeRow.store_name as string) ?? "",
        store_slug: (storeRow.slug as string) ?? "",
        order_chat_ready,
        store_pickup_address_lines,
      },
      order: { ...order, review_status: snapshotGate.review_status, items: snapshotGate.items },
      delivery: snapshotGate.delivery,
      review,
    };
    logStoreOrderDetailPerf({
      route: "owner_get",
      auth_ms,
      order_fetch_ms: 0,
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
      ownership_ms: 0,
    });
    return NextResponse.json(body);
  }

  const tOwn0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  const ownership_ms = Math.round(perfNowMs() - tOwn0);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: storeRow } = await sb
    .from("stores")
    .select("store_name, slug, region, city, district, address_line1, address_line2")
    .eq("id", sid)
    .maybeSingle();
  const store_pickup_address_lines = storeRow
    ? formatStorePickupAddressLines({
        region: storeRow.region as string | null | undefined,
        city: storeRow.city as string | null | undefined,
        district: storeRow.district as string | null | undefined,
        address_line1: storeRow.address_line1 as string | null | undefined,
        address_line2: storeRow.address_line2 as string | null | undefined,
      })
    : [];

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters"
    )
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const room_id_exists: 0 | 1 =
    typeof order.community_messenger_room_id === "string" &&
    order.community_messenger_room_id.trim()
      ? 1
      : 0;

  const tItems0 = perfNowMs();
  const itemsPromise = sb
    .from("store_order_items")
    .select("id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
    .eq("order_id", oid)
    .then((r) => ({ r, ms: Math.round(perfNowMs() - tItems0) }));

  const tReview0 = perfNowMs();
  const reviewStatusPromise = loadOwnerOrderReviewStatus(sbAny, oid, String(order.order_status ?? "")).then(
    (r) => ({ r, ms: Math.round(perfNowMs() - tReview0) })
  );
  const tDelivery0 = perfNowMs();
  const deliveryPromise = loadDeliverySnapshot(sbAny, oid).then((r) => ({
    r,
    ms: Math.round(perfNowMs() - tDelivery0),
  }));

  const [{ r: itemsRes, ms: items_fetch_ms }, { r: reviewStatus, ms: review_meta_ms }, { r: deliverySnap, ms: delivery_snapshot_ms }] =
    await Promise.all([itemsPromise, reviewStatusPromise, deliveryPromise]);

  const review = await loadOwnerOrderReviewDetail(
    sbAny,
    oid,
    String(order.order_status ?? ""),
    reviewStatus
  );

  const { data: items, error: iErr } = itemsRes;
  if (iErr) {
    console.error("[GET store order]", iErr);
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  }

  const order_chat_ready = room_id_exists === 1;

  const body = {
    ok: true as const,
    meta: {
      owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
      owner_user_id: userId,
      store_name: (storeRow?.store_name as string) ?? "",
      store_slug: (storeRow?.slug as string) ?? "",
      order_chat_ready,
      store_pickup_address_lines,
    },
    order: { ...order, review_status: reviewStatus, items: items ?? [] },
    delivery: deliverySnap.ok ? deliverySnap.delivery : null,
    review,
  };

  logStoreOrderDetailPerf({
    route: "owner_get",
    auth_ms,
    order_fetch_ms: 0,
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
    db_round_trips: 4,
    ownership_ms,
  });

  return NextResponse.json(body);
}

/** 매장 오너: 주문 상태 변경 (취소 시 재고 복구) */
export async function PATCH(
  req: NextRequest,
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

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nextStatus = String(body.order_status ?? "").trim();
  if (!nextStatus || !isValidOrderStatus(nextStatus)) {
    return NextResponse.json({ ok: false, error: "invalid_order_status" }, { status: 400 });
  }

  /** 구매자 PATCH·관리자 처리 전용 — 오너가 설정하면 안 되는 값 (허용 전이 밖이어도 명시 차단) */
  if (nextStatus === "refund_requested" || nextStatus === "refunded") {
    return NextResponse.json({ ok: false, error: "owner_cannot_set_order_status" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, admin_locked")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  if ((order as { admin_locked?: boolean }).admin_locked === true) {
    return NextResponse.json({ ok: false, error: "order_admin_locked" }, { status: 409 });
  }

  const rm = getAuditRequestMeta(req);
  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus,
    ownerAcceptPrepMinutes:
      nextStatus === "accepted" ? body.estimated_prep_minutes ?? null : null,
    audit: {
      actor_type: "user",
      actor_id: userId,
      action: "store_order.owner_status",
      ip: rm.ip,
      user_agent: rm.userAgent,
    },
  });

  if (!applied.ok) {
    const st =
      applied.error === "order_not_found"
        ? 404
        : applied.error === "invalid_order_status" ||
            applied.error === "invalid_transition" ||
            applied.error === "prep_minutes_required"
          ? 400
          : applied.httpStatus;
    return NextResponse.json({ ok: false, error: applied.error }, { status: st });
  }

  invalidateStoreOrderCountsCache(sid, userId);
  invalidateOwnerHubBadgeCache(userId);
  invalidateOwnerStoreOrdersListCache(sid, userId, {
    route: "PATCH /api/me/stores/[storeId]/orders/[orderId]",
    orderId: oid,
    reason: "order_status_mutation",
    afterMutationSuccess: true,
  });
  await deleteOwnerStoreOrdersListSnapshotCounter(sb, sid, userId);

  return NextResponse.json({ ok: true, order_status: applied.order_status });
}
