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
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { appendStoreOrderMessengerStatusTransition } from "@/lib/community-messenger/store-order-chat-service";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import {
  tryLoadBuyerStoreOrderDetailFromSnapshot,
} from "@/lib/stores/store-order-detail-snapshot";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/stores/buyer-store-orders-list-snapshot-cache";
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
      invalidateStoreOrderDetailSnapshot(oid, buyerId, "refund_requested");
      invalidateBuyerStoreOrdersListSnapshot(buyerId, "refund_requested");
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

    invalidateStoreOrderDetailSnapshot(oid, buyerId, "refund_requested");
    invalidateBuyerStoreOrdersListSnapshot(buyerId, "refund_requested");
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

  invalidateStoreOrderCountsCache(order.store_id as string, cancelOwnerId ?? undefined);
  if (cancelOwnerId) invalidateOwnerHubBadgeCache(cancelOwnerId);

  invalidateStoreOrderDetailSnapshot(oid, buyerId, "cancelled");
  invalidateBuyerStoreOrdersListSnapshot(buyerId, "cancelled");
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

  invalidateStoreOrderDetailSnapshot(oid, buyerId, "buyer_hide");
  invalidateBuyerStoreOrdersListSnapshot(buyerId, "buyer_hide");
  return NextResponse.json({ ok: true, hidden: true });
}
