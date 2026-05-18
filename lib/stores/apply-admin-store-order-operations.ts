import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { appendStoreOrderMessengerStatusTransition } from "@/lib/community-messenger/store-order-chat-service";
import {
  notifyBuyerStoreRefundApproved,
  notifyBuyerStoreOrderOwnerStatus,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";
import {
  buildStoreOrderEventDedupeKey,
  createStoreOrderEvent,
  mapOrderStatusToEventType,
} from "@/lib/stores/store-order-events";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { applyAdminStoreOrderRefund } from "@/lib/stores/apply-admin-store-order-refund";
import {
  canBuyerRequestStoreRefund,
  shouldRestoreStockOnCancel,
} from "@/lib/stores/order-status-transitions";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export type AdminOrderOpsAudit = {
  adminUserId: string;
  ip?: string | null;
  user_agent?: string | null;
};

function invalidateCaches(sb: SupabaseClient, storeId: string, ownerUserId: string | null): void {
  invalidateStoreOrderCountsCache(storeId.trim());
  if (ownerUserId) invalidateOwnerHubBadgeCache(ownerUserId);
}

async function loadOwnerUserId(sb: SupabaseClient, storeId: string): Promise<string | null> {
  const { data } = await sb.from("stores").select("owner_user_id").eq("id", storeId.trim()).maybeSingle();
  const id = (data as { owner_user_id?: string } | null)?.owner_user_id;
  return id ? String(id).trim() : null;
}

/**
 * 관리자 강제 취소 — 상태 머신 우회, 재고·정산은 기존 규칙과 정합.
 */
export async function adminForceCancelStoreOrder(
  sb: SupabaseClient,
  orderId: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, buyer_user_id, order_no, order_status, payment_status, fulfillment_type"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const os = order.order_status as string;
  const sid = order.store_id as string;

  if (os === "cancelled") return { ok: true };
  if (os === "refunded") return { ok: false, error: "cannot_force_cancel_refunded", httpStatus: 409 };
  if (os === "completed") return { ok: false, error: "cannot_force_cancel_completed", httpStatus: 409 };

  const ownerId = await loadOwnerUserId(sb, sid);

  if (shouldRestoreStockOnCancel(os)) {
    const { data: lines, error: iErr } = await sb
      .from("store_order_items")
      .select("product_id, qty")
      .eq("order_id", oid);
    if (iErr) {
      console.error("[adminForceCancelStoreOrder] items", iErr);
      return { ok: false, error: iErr.message, httpStatus: 500 };
    }
    await restoreStockForOrderLines(
      sb,
      (lines ?? []).map((r) => ({
        product_id: r.product_id as string,
        qty: r.qty as number,
      }))
    );
  }

  const patch: Record<string, unknown> = {
    order_status: "cancelled",
    payment_status: "cancelled",
    auto_complete_at: null,
  };

  let uErr = (await sb.from("store_orders").update(patch).eq("id", oid)).error;
  if (uErr?.message?.includes("auto_complete_at") && uErr.message.includes("does not exist")) {
    uErr = (
      await sb
        .from("store_orders")
        .update({ order_status: "cancelled", payment_status: "cancelled" })
        .eq("id", oid)
    ).error;
  }
  if (uErr) {
    console.error("[adminForceCancelStoreOrder]", uErr);
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }

  await cancelScheduledSettlementForOrder(sb, oid);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_force_cancel",
    before_json: {
      order_status: os,
      payment_status: order.payment_status as string,
      store_id: sid,
      bypass_transition: true,
    },
    after_json: { order_status: "cancelled", payment_status: "cancelled", store_id: sid },
    ip: audit.ip ?? null,
    user_agent: audit.user_agent ?? null,
  });

  const cancelEt = mapOrderStatusToEventType("cancelled");
  const cancelEv = await createStoreOrderEvent(sb, {
    orderId: oid,
    storeId: sid,
    actorUserId: audit.adminUserId,
    actorRole: "admin",
    eventType: cancelEt,
    fromStatus: os,
    toStatus: "cancelled",
    dedupeKey: buildStoreOrderEventDedupeKey({
      orderId: oid,
      eventType: cancelEt,
      toStatus: "cancelled",
      actorUserId: audit.adminUserId,
    }),
    metadata: { source: "admin_force_cancel" },
  });
  if (cancelEv.ok) {
    if (cancelEv.inserted) {
      void notifyBuyerStoreOrderOwnerStatus(sb, {
        buyerUserId: order.buyer_user_id as string,
        orderId: oid,
        orderNo: String(order.order_no ?? ""),
        storeId: sid,
        nextStatus: "cancelled",
        storeOrderEventId: cancelEv.row.id,
      });
    }
  } else {
    void notifyBuyerStoreOrderOwnerStatus(sb, {
      buyerUserId: order.buyer_user_id as string,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
      storeId: sid,
      nextStatus: "cancelled",
    });
  }

  try {
    await appendStoreOrderMessengerStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      os,
      "cancelled"
    );
  } catch {
    /* ignore */
  }

  invalidateCaches(sb, sid, ownerId);
  return { ok: true };
}

/**
 * 관리자가 환불 요청 상태로 설정 (구매자 요청과 동일 원장 반영).
 */
export async function adminSetRefundRequestedStoreOrder(
  sb: SupabaseClient,
  orderId: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, order_no, order_status, payment_status")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const os = order.order_status as string;
  const ps = order.payment_status as string;
  const sid = order.store_id as string;

  if (os === "refund_requested") return { ok: true };
  if (os === "refunded") return { ok: false, error: "already_refunded", httpStatus: 409 };
  if (!canBuyerRequestStoreRefund(os, ps)) {
    return { ok: false, error: "cannot_set_refund_requested_for_status", httpStatus: 400 };
  }

  const patch: Record<string, unknown> = {
    order_status: "refund_requested",
    auto_complete_at: null,
  };

  let uErr = (await sb.from("store_orders").update(patch).eq("id", oid)).error;
  if (uErr?.message?.includes("auto_complete_at") && uErr.message.includes("does not exist")) {
    uErr = (await sb.from("store_orders").update({ order_status: "refund_requested" }).eq("id", oid)).error;
  }
  if (uErr) {
    console.error("[adminSetRefundRequestedStoreOrder]", uErr);
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }

  const ownerId = await loadOwnerUserId(sb, sid);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_set_refund_requested",
    before_json: { order_status: os, payment_status: ps, store_id: sid, bypass_transition: true },
    after_json: { order_status: "refund_requested", store_id: sid },
    ip: audit.ip ?? null,
    user_agent: audit.user_agent ?? null,
  });

  const refundReqEv = await createStoreOrderEvent(sb, {
    orderId: oid,
    storeId: sid,
    actorUserId: audit.adminUserId,
    actorRole: "admin",
    eventType: "refund_requested",
    fromStatus: os,
    toStatus: "refund_requested",
    dedupeKey: buildStoreOrderEventDedupeKey({
      orderId: oid,
      eventType: "refund_requested",
      toStatus: "refund_requested",
      actorUserId: audit.adminUserId,
    }),
    metadata: { source: "admin_set_refund_requested" },
  });
  if (refundReqEv.ok) {
    if (refundReqEv.inserted) {
      void notifyStoreOwnerRefundRequested(sb, {
        storeId: sid,
        orderId: oid,
        orderNo: String(order.order_no ?? ""),
        storeOrderEventId: refundReqEv.row.id,
      });
    }
  } else {
    void notifyStoreOwnerRefundRequested(sb, {
      storeId: sid,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
    });
  }

  try {
    await appendStoreOrderMessengerStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      os,
      "refund_requested"
    );
  } catch {
    /* ignore */
  }

  invalidateCaches(sb, sid, ownerId);
  return { ok: true };
}

export type AdminStoreOrderMetaPatch = {
  admin_locked?: boolean;
  admin_flagged?: boolean;
  admin_note?: string | null;
  dispute_status?: string | null;
  needs_admin_attention?: boolean;
};

/** 관리자 플래그·메모만 수선 */
export async function adminPatchStoreOrderMeta(
  sb: SupabaseClient,
  orderId: string,
  patch: AdminStoreOrderMetaPatch,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const row: Record<string, unknown> = {};
  if (typeof patch.admin_locked === "boolean") row.admin_locked = patch.admin_locked;
  if (typeof patch.admin_flagged === "boolean") row.admin_flagged = patch.admin_flagged;
  if (patch.admin_note !== undefined) {
    const t = typeof patch.admin_note === "string" ? patch.admin_note.trim() : "";
    row.admin_note = t.length ? t.slice(0, 4000) : null;
  }
  if (patch.dispute_status !== undefined) {
    const d = typeof patch.dispute_status === "string" ? patch.dispute_status.trim().slice(0, 80) : "";
    row.dispute_status = d.length ? d : null;
  }
  if (typeof patch.needs_admin_attention === "boolean") {
    row.needs_admin_attention = patch.needs_admin_attention;
  }

  if (Object.keys(row).length === 0) {
    return { ok: false, error: "empty_meta_patch", httpStatus: 400 };
  }

  const { data: before, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, admin_locked, admin_flagged, admin_note, dispute_status, needs_admin_attention"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !before) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const uErr = (await sb.from("store_orders").update(row).eq("id", oid)).error;
  if (uErr) {
    const missing =
      /admin_locked|admin_flagged|admin_note|refund_approved_at|refunded_at|dispute_status|needs_admin_attention/i.test(
        String(uErr.message)
      ) && /does not exist/i.test(String(uErr.message));
    if (missing) {
      return { ok: false, error: "admin_columns_missing_apply_migration", httpStatus: 503 };
    }
    console.error("[adminPatchStoreOrderMeta]", uErr);
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_patch_meta",
    before_json: before as Record<string, unknown>,
    after_json: row,
    ip: audit.ip ?? null,
    user_agent: audit.user_agent ?? null,
  });

  const sid = before.store_id as string;
  const ownerId = await loadOwnerUserId(sb, sid);
  invalidateCaches(sb, sid, ownerId);
  return { ok: true };
}

/** 환불 완료 — 기존 서비스 + 감사 로그 보강 */
export async function adminCompleteRefundStoreOrder(
  sb: SupabaseClient,
  orderId: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  const res = await applyAdminStoreOrderRefund(sb, oid);
  if (!res.ok) return res;

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_complete_refund",
    before_json: {},
    after_json: { via: "applyAdminStoreOrderRefund" },
    ip: audit.ip ?? null,
    user_agent: audit.user_agent ?? null,
  });

  if (!res.already) {
    const { data: ordRow } = await sb
      .from("store_orders")
      .select("store_id, buyer_user_id, order_no")
      .eq("id", oid)
      .maybeSingle();
    if (ordRow) {
      const sid = String((ordRow as { store_id?: string }).store_id ?? "").trim();
      const buyerUid = String((ordRow as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
      if (sid) {
        const refundOkEv = await createStoreOrderEvent(sb, {
          orderId: oid,
          storeId: sid,
          actorUserId: audit.adminUserId,
          actorRole: "admin",
          eventType: "refund_approved",
          fromStatus: "refund_requested",
          toStatus: "refunded",
          dedupeKey: buildStoreOrderEventDedupeKey({
            orderId: oid,
            eventType: "refund_approved",
            toStatus: "refunded",
            actorUserId: audit.adminUserId,
          }),
          metadata: { source: "admin_complete_refund" },
        });
        if (buyerUid) {
          if (refundOkEv.ok) {
            if (refundOkEv.inserted) {
              void notifyBuyerStoreRefundApproved(sb, {
                buyerUserId: buyerUid,
                orderId: oid,
                orderNo: String((ordRow as { order_no?: string }).order_no ?? ""),
                storeId: sid,
                storeOrderEventId: refundOkEv.row.id,
              });
            }
          } else {
            void notifyBuyerStoreRefundApproved(sb, {
              buyerUserId: buyerUid,
              orderId: oid,
              orderNo: String((ordRow as { order_no?: string }).order_no ?? ""),
              storeId: sid,
            });
          }
        }
      }
    }
  }

  const { data: row } = await sb.from("store_orders").select("store_id").eq("id", oid).maybeSingle();
  const sid = (row as { store_id?: string } | null)?.store_id;
  if (sid) {
    const ownerId = await loadOwnerUserId(sb, sid);
    invalidateCaches(sb, sid, ownerId);
  }

  return { ok: true, already: res.already };
}
