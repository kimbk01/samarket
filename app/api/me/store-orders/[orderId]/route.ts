import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { normalizeOwnerDecisionReason } from "@/lib/stores/owner-store-order-decision-contract";
import { resolveStoreOrderCancelPolicy } from "@/lib/stores/store-order-cancel-policy";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import {
  tryLoadBuyerStoreOrderDetailFromSnapshot,
} from "@/lib/stores/store-order-detail-snapshot";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache";
import {
  jsonPayloadKb,
  logStoreOrderDetailPerf,
  perfNowMs,
} from "@/lib/stores/store-order-detail-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshotResponseHeaders(snapshotVia?: string): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-store-order-detail-snapshot-path": "1",
    "x-samarket-store-order-detail-snapshot-via": snapshotVia,
    "x-samarket-store-order-detail-query-wave-2-ms": "0",
    "x-samarket-store-order-detail-rpc-removed": "1",
  };
}

/** 구매자: 주문 단건 + 라인 — read-only (ensure/summary → POST ensure-chat·주문 생성·채팅 진입) */
export async function GET(
  req: NextRequest,
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

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const storeOrderDetailBypass =
    req.nextUrl.searchParams.get("storeOrderDetailBypass") === "1" &&
    process.env.NODE_ENV === "development";

  const tAuth0 = perfNowMs();
  const [session, snap] = await Promise.all([
    validateActiveSession(buyerId),
    tryLoadBuyerStoreOrderDetailFromSnapshot(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      buyerId,
      oid,
      { bypassCounter: fresh || storeOrderDetailBypass }
    ),
  ]);
  const auth_ms = Math.round(perfNowMs() - tAuth0);
  if (!session.ok) return session.response;

  void (async () => {
    try {
      const { clearNotificationTarget } = await import("@/lib/notifications/notification-targets");
      await clearNotificationTarget(sb as import("@supabase/supabase-js").SupabaseClient<any>, {
        userId: buyerId,
        targetType: "buyer_order",
        targetId: oid,
      });
    } catch {
      /* badge target clear best-effort */
    }
  })();

  if (snap && "body" in snap) {
    const linkedRoomId =
      typeof snap.body.order.community_messenger_room_id === "string"
        ? snap.body.order.community_messenger_room_id.trim()
        : "";
    const room_id_exists: 0 | 1 = linkedRoomId ? 1 : 0;
    logStoreOrderDetailPerf({
      route: "buyer_get",
      auth_ms,
      order_fetch_ms: snap.rpcWallMs,
      items_fetch_ms: 0,
      review_meta_ms: 0,
      delivery_snapshot_ms: 0,
      ensure_room_ms: 0,
      append_summary_ms: 0,
      participant_upsert_ms: 0,
      room_update_ms: 0,
      unread_sync_ms: 0,
      total_ms: Math.round(perfNowMs() - wall0),
      payload_kb: jsonPayloadKb(snap.body),
      room_id_exists,
      ensure_skipped: 1,
      summary_skipped: 1,
      snapshot_via: "rpc_snapshot",
      db_round_trips: 1,
      rpc_wall_ms: snap.rpcWallMs,
    });
    return NextResponse.json(snap.body, {
      headers: snapshotResponseHeaders(snap.snapshotVia),
    });
  }

  if (snap && "ok" in snap && snap.ok === false) {
    return NextResponse.json({ ok: false, error: snap.error }, { status: snap.status });
  }

  return NextResponse.json(
    { ok: false, error: "snapshot_unavailable" },
    { status: 503 }
  );
}

type PatchBody = {
  cancel?: boolean;
  /** 진행 중 취소 요청 (매장이 승인·반려). `request_refund`/`refund_reason` 은 이전 클라이언트 별칭. */
  request_cancel?: boolean;
  cancel_reason?: string;
  request_refund?: boolean;
  refund_reason?: string;
};

/**
 * 구매자: 접수 전 취소 | 진행 중(수락~배달 픽업 전) 취소 요청 — 매장이 결정
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

  const requestCancel = body.request_cancel === true || body.request_refund === true;
  if (body.cancel && requestCancel) {
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

  if (requestCancel) {
    const status = String(order.order_status ?? "");
    if (status === "cancel_requested" || status === "cancelled") {
      invalidateStoreOrderDetailSnapshot(oid, buyerId, status);
      invalidateBuyerStoreOrdersListSnapshot(buyerId, status);
      return NextResponse.json({ ok: true, order_status: status });
    }
    const reasonCheck = normalizeOwnerDecisionReason(body.cancel_reason ?? body.refund_reason);
    if (!reasonCheck.ok) {
      return NextResponse.json({ ok: false, error: "cancel_reason_required" }, { status: 400 });
    }
    const { data: delivery } = await sb
      .from("store_order_deliveries")
      .select("delivery_status")
      .eq("order_id", oid)
      .maybeSingle();
    const policy = resolveStoreOrderCancelPolicy({
      role: "buyer",
      orderStatus: status,
      paymentStatus: String(order.payment_status ?? ""),
      deliveryStatus: (delivery as { delivery_status?: string } | null)?.delivery_status ?? null,
    });
    if (policy.kind !== "request_cancel") {
      return NextResponse.json({ ok: false, error: "cannot_request_cancel" }, { status: 400 });
    }

    // Ledger first: the store decides from this row; a failed status write removes it again.
    const { data: reqRow, error: insErr } = await sb
      .from("store_order_cancel_requests")
      .insert({
        order_id: oid,
        previous_order_status: status,
        requested_by: buyerId,
        requested_role: "buyer",
        reason: reasonCheck.reason,
        status: "pending",
        refund_status: "pending",
      })
      .select("id")
      .maybeSingle();
    if (insErr || !reqRow?.id) {
      const duplicate = String(insErr?.code ?? "") === "23505";
      return NextResponse.json(
        { ok: false, error: duplicate ? "cancel_request_pending" : "cancel_request_failed" },
        { status: duplicate ? 409 : 500 }
      );
    }

    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: oid,
      nextStatus: "cancel_requested",
      actor: "CUSTOMER",
      audit: {
        actor_type: "user",
        actor_id: buyerId,
        action: "store_order.buyer_cancel_request",
        ip: rm.ip,
        user_agent: rm.userAgent,
      },
    });
    if (!applied.ok) {
      await sb.from("store_order_cancel_requests").delete().eq("id", String(reqRow.id)).eq("status", "pending");
      return NextResponse.json({ ok: false, error: applied.error }, { status: applied.httpStatus });
    }

    const { data: stRow } = await sb
      .from("stores")
      .select("owner_user_id")
      .eq("id", order.store_id as string)
      .maybeSingle();
    const ownerId = stRow?.owner_user_id ? String(stRow.owner_user_id) : null;
    invalidateStoreOrderCountsCache(order.store_id as string, ownerId ?? undefined);
    if (ownerId) invalidateOwnerHubBadgeCache(ownerId);
    invalidateStoreOrderDetailSnapshot(oid, buyerId, "cancel_requested");
    invalidateBuyerStoreOrdersListSnapshot(buyerId, "cancel_requested");
    return NextResponse.json({ ok: true, order_status: "cancel_requested" });
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

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: "cancelled",
    actor: "CUSTOMER",
    audit: {
      actor_type: "user",
      actor_id: buyerId,
      action: "store_order.buyer_cancel",
      ip: rm.ip,
      user_agent: rm.userAgent,
    },
  });
  if (!applied.ok) {
    return NextResponse.json({ ok: false, error: applied.error }, { status: applied.httpStatus });
  }

  let cancelOwnerId: string | null = null;
  const { data: stRow2 } = await sb
    .from("stores")
    .select("owner_user_id")
    .eq("id", order.store_id as string)
    .maybeSingle();
  cancelOwnerId = stRow2?.owner_user_id ? String(stRow2.owner_user_id) : null;

  invalidateStoreOrderCountsCache(order.store_id as string, cancelOwnerId ?? undefined);
  if (cancelOwnerId) invalidateOwnerHubBadgeCache(cancelOwnerId);

  return NextResponse.json({
    ok: true,
    order_status: "cancelled",
    payment_status: "cancelled",
  });
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

  invalidateStoreOrderDetailSnapshot(oid, buyerId, "buyer_hide");
  invalidateBuyerStoreOrdersListSnapshot(buyerId, "buyer_hide");
  return NextResponse.json({ ok: true, hidden: true });
}
