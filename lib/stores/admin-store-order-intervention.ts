/**
 * Admin intervention on a store order — the one server path behind the order detail
 * 「관리자 개입」 panel and the legacy admin decision endpoints.
 * Contract: lib/admin/store-orders/admin-store-order-intervention-contract.ts
 *
 * 1. reason is required (admin-only record: audit log `store_order.admin_intervention`)
 * 2. the status the admin saw (`expectedStatus`) is re-checked on the server
 * 3. the action must be allowed by the ADMIN transition graph for the current status
 * 4. refund reject restores the status recorded before the request (never client-chosen)
 * 5. the status write itself is `applyStoreOrderStatusTransition` (CAS) via the existing ops
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
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
import { ADMIN_REFUND_REQUEST_RESTORE_STATUSES } from "@/lib/stores/order-status-transitions";

export type AdminStoreOrderInterventionResult =
  | { ok: true; fromStatus: string; toStatus: string }
  | { ok: false; error: string; httpStatus: number; currentStatus?: string };

/** Status recorded right before the latest move into `refund_requested` (allowed restores only). */
export async function resolveRefundRequestRestoreStatus(
  sb: SupabaseClient,
  orderId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("store_order_events")
    .select("from_status")
    .eq("order_id", orderId)
    .eq("to_status", "refund_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const from = String((data as { from_status?: unknown }).from_status ?? "").trim();
  return ADMIN_REFUND_REQUEST_RESTORE_STATUSES.has(from) ? from : null;
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
  if (expected && expected !== current) {
    return { ok: false, error: "status_changed", httpStatus: 409, currentStatus: current };
  }
  if (!adminStoreOrderInterventionActions(current, String(order.payment_status ?? "")).includes(input.action)) {
    return { ok: false, error: "action_not_allowed_for_status", httpStatus: 409, currentStatus: current };
  }

  let toStatus = current;
  let res: { ok: true } | { ok: false; error: string; httpStatus: number };
  switch (input.action) {
    case "cancel_request_approve":
      toStatus = "cancelled";
      res = await adminApproveStoreOrderCancelRequest(sb, oid, input.audit);
      break;
    case "cancel_request_reject":
      res = await adminRejectStoreOrderCancelRequest(sb, oid, reason, input.audit);
      break;
    case "refund_approve":
      toStatus = "refunded";
      res = await adminCompleteRefundStoreOrder(sb, oid, input.audit);
      break;
    case "refund_reject": {
      const restore = await resolveRefundRequestRestoreStatus(sb, oid);
      if (!restore) return { ok: false, error: "refund_restore_status_unknown", httpStatus: 409, currentStatus: current };
      toStatus = restore;
      res = await adminRejectRefundStoreOrder(sb, oid, restore, reason, input.audit);
      break;
    }
    case "force_cancel":
      toStatus = "cancelled";
      res = await adminForceCancelStoreOrder(sb, oid, input.audit);
      break;
    case "refund_request_create":
      toStatus = "refund_requested";
      res = await adminSetRefundRequestedStoreOrder(sb, oid, input.audit);
      break;
  }
  if (!res.ok) return { ...res, currentStatus: current };

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

  return { ok: true, fromStatus: current, toStatus };
}
