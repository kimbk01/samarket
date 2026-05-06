import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { ensureOrderChatRoom } from "@/lib/order-chat/service";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { ownerAcceptRequiresRecordedPayment } from "@/lib/stores/owner-order-payment-policy";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { isValidOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

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

/** 매장 오너: 단일 주문 + 라인 */
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
      "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention"
    )
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const { data: items, error: iErr } = await sb
    .from("store_order_items")
    .select("id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
    .eq("order_id", oid);

  if (iErr) {
    console.error("[GET store order]", iErr);
    return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  }

  let order_chat_ready = false;
  const deliverySnap = await loadDeliverySnapshot(sb as import("@supabase/supabase-js").SupabaseClient<any>, oid);
  try {
    const ens = await ensureOrderChatRoom(sb as import("@supabase/supabase-js").SupabaseClient<any>, oid);
    if (ens.ok) order_chat_ready = true;
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    meta: {
      owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
      owner_user_id: userId,
      store_name: (storeRow?.store_name as string) ?? "",
      store_slug: (storeRow?.slug as string) ?? "",
      order_chat_ready,
      store_pickup_address_lines,
    },
    order: { ...order, items: items ?? [] },
    delivery: deliverySnap.ok ? deliverySnap.delivery : null,
  });
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

  invalidateStoreOrderCountsCache(sid);
  invalidateOwnerHubBadgeCache(userId);

  return NextResponse.json({ ok: true, order_status: applied.order_status });
}
