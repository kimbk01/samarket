/**
 * Admin intervention on a store order — the one server path behind the order detail
 * 「관리자 개입」 panel and the legacy admin decision endpoints.
 * Contract: lib/admin/store-orders/admin-store-order-intervention-contract.ts
 *
 * 1. reason is required (admin-only record: audit log `store_order.admin_intervention`)
 * 2. the status the admin saw (`expectedStatus`) is re-checked on the server
 * 3. the action must be allowed by the ADMIN transition graph for the current status
 * 4. refund reject restores the status recorded before the request (never client-chosen)
 * 5. the status write itself is `applyStoreOrderStatusTransition` (CAS) via the existing ops — the CAS
 *    value is the status from step 2 (ORD-04); a change in between → 409 `status_changed`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { safeNotifyOwnerAdminOrderIntervention } from "@/lib/stores/notify-owner-admin-order-intervention";
import {
  adminStoreOrderInterventionActions,
  normalizeAdminInterventionReason,
  type AdminStoreOrderInterventionAction,
} from "@/lib/admin/store-orders/admin-store-order-intervention-contract";
import {
  adminApproveStoreOrderCancelRequest,
  adminCompleteRefundStoreOrder,
  adminForceCancelStoreOrder,
  adminRejectRefundStoreOrder,
  adminRejectStoreOrderCancelRequest,
  adminSetRefundRequestedStoreOrder,
  type AdminOrderOpsAudit,
} from "@/lib/stores/apply-admin-store-order-operations";
import { ADMIN_REFUND_REQUEST_RESTORE_STATUSES, isValidOrderStatus } from "@/lib/stores/order-status-transitions";

export type AdminStoreOrderInterventionResult =
  | { ok: true; fromStatus: string; toStatus: string }
  | { ok: false; error: string; httpStatus: number; currentStatus?: string };

type OrderStatusEvent = { from_status: string | null; to_status: string | null; created_at: string };

/**
 * Restore target for a refund reject = the order status recorded right before the CURRENT
 * refund request. Returns null (→ block, never guess) unless the record is unambiguous:
 * - the latest order-status event is the move into `refund_requested`, and there is exactly
 *   one such event in the current run (missing event → older cycle; duplicate → ambiguous)
 * - no other order-status event shares its timestamp (ordering ambiguous)
 * - the event before it ended in that same `from_status` (history consistent)
 * - `from_status` is an allowed restore status
 * Only order-status values count (`to_status` also carries delivery statuses).
 */
export function pickRefundRequestRestoreStatus(eventsNewestFirst: readonly OrderStatusEvent[]): string | null {
  const events = eventsNewestFirst.filter((e) => isValidOrderStatus(String(e.to_status ?? "")));
  let run = 0;
  while (run < events.length && events[run].to_status === "refund_requested") run++;
  if (run !== 1) return null;
  const current = events[0];
  if (events.slice(1).some((e) => e.created_at === current.created_at)) return null;
  const from = String(current.from_status ?? "").trim();
  if (!ADMIN_REFUND_REQUEST_RESTORE_STATUSES.has(from)) return null;
  const before = events[1];
  if (!before || before.to_status !== from) return null;
  return from;
}

export async function resolveRefundRequestRestoreStatus(
  sb: SupabaseClient,
  orderId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("store_order_events")
    .select("from_status, to_status, created_at")
    .eq("order_id", orderId)
    .not("to_status", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return null;
  return pickRefundRequestRestoreStatus(data as OrderStatusEvent[]);
}

export async function runAdminStoreOrderIntervention(
  sb: SupabaseClient,
  input: {
    orderId: string;
    action: AdminStoreOrderInterventionAction;
    reason: unknown;
    /** Status shown to the admin when they decided; omitted only by legacy endpoints. */
    expectedStatus?: string | null;
    audit: AdminOrderOpsAudit;
  }
): Promise<AdminStoreOrderInterventionResult> {
  const oid = input.orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const r = normalizeAdminInterventionReason(input.reason);
  if (!r.ok) return { ok: false, error: r.error, httpStatus: 400 };
  const reason = r.reason;

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, order_status, payment_status")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const current = String(order.order_status ?? "");
  const expected = String(input.expectedStatus ?? "").trim();
  // 모든 관리자 주문 결정은 화면에서 본 상태를 함께 보내야 한다 (레거시 경로 포함, DEF-8).
  if (!expected) return { ok: false, error: "expected_status_required", httpStatus: 400 };
  if (expected !== current) {
    return { ok: false, error: "status_changed", httpStatus: 409, currentStatus: current };
  }
  if (!adminStoreOrderInterventionActions(current, String(order.payment_status ?? "")).includes(input.action)) {
    return { ok: false, error: "action_not_allowed_for_status", httpStatus: 409, currentStatus: current };
  }

  let toStatus = current;
  let res: { ok: true } | { ok: false; error: string; httpStatus: number };
  // ORD-04: every status write is a CAS on the status the admin saw (not a value re-read later).
  const cas = { expectedStatus: expected };
  switch (input.action) {
    case "cancel_request_approve":
      toStatus = "cancelled";
      res = await adminApproveStoreOrderCancelRequest(sb, oid, input.audit, cas);
      break;
    case "cancel_request_reject":
      res = await adminRejectStoreOrderCancelRequest(sb, oid, reason, input.audit, cas);
      break;
    case "refund_approve":
      toStatus = "refunded";
      res = await adminCompleteRefundStoreOrder(sb, oid, input.audit, cas);
      break;
    case "refund_reject": {
      const restore = await resolveRefundRequestRestoreStatus(sb, oid);
      if (!restore) return { ok: false, error: "refund_restore_status_unknown", httpStatus: 409, currentStatus: current };
      toStatus = restore;
      res = await adminRejectRefundStoreOrder(sb, oid, restore, reason, input.audit, cas);
      break;
    }
    case "force_cancel":
      toStatus = "cancelled";
      res = await adminForceCancelStoreOrder(sb, oid, input.audit, cas);
      break;
    case "refund_request_create":
      toStatus = "refund_requested";
      res = await adminSetRefundRequestedStoreOrder(sb, oid, input.audit, cas);
      break;
  }
  if (!res.ok) {
    // The order changed between the admin's view and the write → the 409 the screen re-fetches on.
    if (res.error === "transition_conflict") {
      const { data: now } = await sb.from("store_orders").select("order_status").eq("id", oid).maybeSingle();
      return {
        ok: false,
        error: "status_changed",
        httpStatus: 409,
        currentStatus: String((now as { order_status?: unknown } | null)?.order_status ?? current),
      };
    }
    return { ...res, currentStatus: current };
  }

  if (input.action === "cancel_request_reject") {
    const { data: after } = await sb.from("store_orders").select("order_status").eq("id", oid).maybeSingle();
    toStatus = String((after as { order_status?: unknown } | null)?.order_status ?? current);
  }

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_intervention",
    before_json: { order_status: current },
    after_json: { action: input.action, reason, order_status: toStatus },
    ip: input.audit.ip ?? null,
    user_agent: input.audit.user_agent ?? null,
  });

  // 사장님에게도 관리자 처리 결과를 알린다 (DEF-67) — 실패해도 결정은 유지.
  await safeNotifyOwnerAdminOrderIntervention(sb, {
    orderId: oid,
    action: input.action,
    reason,
  });

  return { ok: true, fromStatus: current, toStatus };
}
