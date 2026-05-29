import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  appendStoreOrderMessengerStatusTransition,
  syncStoreOrderMessengerRoomContextMeta,
} from "@/lib/community-messenger/store-order-chat-service";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/stores/buyer-store-orders-list-snapshot-cache";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { createStoreOrderEvent } from "@/lib/stores/store-order-events";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { resolveStoreOrderCancelPolicy } from "@/lib/stores/store-order-cancel-policy";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  reason?: string;
  detail_reason?: string;
};

function cleanReason(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return s.slice(0, 500);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { storeId, orderId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!sid || !oid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Body = {};
  try {
    body = (await req.json().catch(() => ({}))) as Body;
  } catch {
    body = {};
  }
  const reason = cleanReason(body.reason);
  const detailReason = cleanReason(body.detail_reason);

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, order_no, order_status, payment_status, fulfillment_type, admin_locked")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  if ((order as { admin_locked?: boolean }).admin_locked === true) {
    return NextResponse.json({ ok: false, error: "order_admin_locked" }, { status: 409 });
  }

  const { data: delivery } = await sb
    .from("store_order_deliveries")
    .select("delivery_status")
    .eq("order_id", oid)
    .maybeSingle();

  const policy = resolveStoreOrderCancelPolicy({
    role: "owner",
    orderStatus: String(order.order_status ?? ""),
    paymentStatus: String(order.payment_status ?? ""),
    deliveryStatus: (delivery as { delivery_status?: string } | null)?.delivery_status ?? null,
  });

  if (policy.kind === "hidden" || policy.kind === "admin_review") {
    return NextResponse.json({ ok: false, error: "cancel_not_allowed_for_status" }, { status: 400 });
  }
  if (policy.reasonRequired && !reason) {
    return NextResponse.json({ ok: false, error: "cancel_reason_required" }, { status: 400 });
  }

  const rm = getAuditRequestMeta(req);

  if (policy.kind === "direct_cancel") {
    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: oid,
      nextStatus: "cancelled",
      audit: {
        actor_type: "user",
        actor_id: userId,
        action: "store_order.owner_cancel",
        ip: rm.ip,
        user_agent: rm.userAgent,
      },
    });
    if (!applied.ok) {
      return NextResponse.json({ ok: false, error: applied.error }, { status: applied.httpStatus });
    }

    await sb.from("store_order_cancel_requests").insert({
      order_id: oid,
      previous_order_status: String(order.order_status ?? ""),
      requested_by: userId,
      requested_role: "owner",
      reason,
      detail_reason: detailReason || null,
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
      refund_status: "not_applicable",
    });

    invalidateStoreOrderCountsCache(sid, userId);
    invalidateOwnerHubBadgeCache(userId);
    invalidateOwnerStoreOrdersListCache(sid, userId, {
      route: "POST /api/me/stores/[storeId]/orders/[orderId]/cancel-request",
      orderId: oid,
      reason: "owner_direct_cancel",
      afterMutationSuccess: true,
    });
    return NextResponse.json({ ok: true, order_status: "cancelled", mode: "direct_cancel" });
  }

  const { error: reqErr } = await sb.from("store_order_cancel_requests").insert({
    order_id: oid,
    previous_order_status: String(order.order_status ?? ""),
    requested_by: userId,
    requested_role: "owner",
    reason,
    detail_reason: detailReason || null,
    status: "pending",
    refund_status: "pending",
  });
  if (reqErr) {
    const duplicate = String(reqErr.code ?? "") === "23505";
    if (!duplicate) {
      console.error("[owner cancel-request] insert", reqErr);
      return NextResponse.json({ ok: false, error: reqErr.message }, { status: 500 });
    }
  }

  const previous = String(order.order_status ?? "");
  const { error: uErr } = await sb
    .from("store_orders")
    .update({ order_status: "cancel_requested", auto_complete_at: null, needs_admin_attention: true })
    .eq("id", oid)
    .eq("store_id", sid);
  if (uErr) {
    console.error("[owner cancel-request] update", uErr);
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: userId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.owner_cancel_request",
    before_json: { order_status: previous, payment_status: order.payment_status, store_id: sid },
    after_json: { order_status: "cancel_requested", reason, detail_reason: detailReason || undefined },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  void createStoreOrderEvent(sb, {
    orderId: oid,
    storeId: sid,
    actorUserId: userId,
    actorRole: "owner",
    eventType: "cancel_requested",
    fromStatus: previous,
    toStatus: "cancel_requested",
    message: reason,
    metadata: { reason, detail_reason: detailReason || undefined, source: "owner_cancel_request" },
  });

  try {
    await appendStoreOrderMessengerStatusTransition(sb as import("@supabase/supabase-js").SupabaseClient<any>, oid, previous, "cancel_requested");
    await syncStoreOrderMessengerRoomContextMeta(sb as import("@supabase/supabase-js").SupabaseClient<any>, oid);
  } catch (err) {
    console.error("[owner cancel-request] messenger sync failed", { orderId: oid, error: err });
  }

  invalidateStoreOrderDetailSnapshot(oid, String(order.buyer_user_id ?? "").trim() || undefined, "cancel_requested");
  invalidateBuyerStoreOrdersListSnapshot(String(order.buyer_user_id ?? "").trim() || undefined, "cancel_requested");
  invalidateStoreOrderCountsCache(sid, userId);
  invalidateOwnerHubBadgeCache(userId);
  invalidateOwnerStoreOrdersListCache(sid, userId, {
    route: "POST /api/me/stores/[storeId]/orders/[orderId]/cancel-request",
    orderId: oid,
    reason: "owner_cancel_request",
    afterMutationSuccess: true,
  });

  return NextResponse.json({ ok: true, order_status: "cancel_requested", mode: "request_cancel" });
}
