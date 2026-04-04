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

export const dynamic = "force-dynamic";

type PatchBody = { order_status?: string };

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
      "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, updated_at, auto_complete_at"
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
    .select("id, store_id")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const rm = getAuditRequestMeta(req);
  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus,
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
        : applied.error === "invalid_order_status" || applied.error === "invalid_transition"
          ? 400
          : applied.httpStatus;
    return NextResponse.json({ ok: false, error: applied.error }, { status: st });
  }

  invalidateStoreOrderCountsCache(sid);
  invalidateOwnerHubBadgeCache(userId);

  return NextResponse.json({ ok: true, order_status: applied.order_status });
}
