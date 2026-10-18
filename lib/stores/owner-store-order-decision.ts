/**
 * Store owner decides a request on its own order (3단계).
 * Contract: lib/stores/owner-store-order-decision-contract.ts
 *
 * 1. ownership + `admin_locked` (an admin intervention in progress wins → 409)
 * 2. the status the owner saw (`expectedStatus`) is re-checked → 409 `status_changed`
 * 3. reject reasons are required (they reach the buyer)
 * 4. restore targets come from server records only:
 *    cancel request → `store_order_cancel_requests.previous_order_status` (pending row)
 *    refund request → `pickRefundRequestRestoreStatus` (unambiguous event evidence, else 409)
 * 5. the status write is `applyStoreOrderStatusTransition` (OWNER graph, CAS); commission and
 *    refunds follow its existing paths (DB trigger / atomic refund RPC) — nothing is written here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { resolveRefundRequestRestoreStatus } from "@/lib/stores/admin-store-order-intervention";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { ADMIN_CANCEL_REQUEST_RESTORE_STATUSES } from "@/lib/stores/order-status-transitions";
import {
  normalizeOwnerDecisionReason,
  ownerDecisionNeedsReason,
  ownerStoreOrderDecisionActions,
  type OwnerStoreOrderDecisionAction,
} from "@/lib/stores/owner-store-order-decision-contract";

export type OwnerStoreOrderDecisionResult =
  | { ok: true; fromStatus: string; toStatus: string }
  | { ok: false; error: string; httpStatus: number; currentStatus?: string };

export async function runOwnerStoreOrderDecision(
  sb: SupabaseClient,
  input: {
    storeId: string;
    orderId: string;
    ownerUserId: string;
    action: OwnerStoreOrderDecisionAction;
    reason: unknown;
    expectedStatus: string;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<OwnerStoreOrderDecisionResult> {
  const oid = input.orderId.trim();
  const sid = input.storeId.trim();

  let reason = "";
  if (ownerDecisionNeedsReason(input.action)) {
    const r = normalizeOwnerDecisionReason(input.reason);
    if (!r.ok) return { ok: false, error: r.error, httpStatus: 400 };
    reason = r.reason;
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, admin_locked")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };
  if ((order as { admin_locked?: boolean }).admin_locked === true) {
    return { ok: false, error: "order_admin_locked", httpStatus: 409 };
  }

  const current = String(order.order_status ?? "");
  if (input.expectedStatus.trim() !== current) {
    return { ok: false, error: "status_changed", httpStatus: 409, currentStatus: current };
  }
  if (!ownerStoreOrderDecisionActions(current).includes(input.action)) {
    return { ok: false, error: "action_not_allowed_for_status", httpStatus: 409, currentStatus: current };
  }

  const audit = {
    actor_type: "user" as const,
    actor_id: input.ownerUserId,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  };

  let toStatus: string;
  let requestRowId: string | null = null;

  if (input.action === "cancel_request_approve" || input.action === "cancel_request_reject") {
    const { data: reqRow, error: rErr } = await sb
      .from("store_order_cancel_requests")
      .select("id, previous_order_status")
      .eq("order_id", oid)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rErr) return { ok: false, error: rErr.message, httpStatus: 500 };
    if (!reqRow?.id) return { ok: false, error: "cancel_request_not_found", httpStatus: 404, currentStatus: current };
    requestRowId = String(reqRow.id);

    if (input.action === "cancel_request_approve") {
      toStatus = "cancelled";
      const applied = await applyStoreOrderStatusTransition(sb, {
        orderId: oid,
        nextStatus: toStatus,
        actor: "OWNER",
        eventMetadata: { source: "owner_cancel_request_approve" },
        audit: { ...audit, action: "store_order.owner_cancel_request_approve" },
      });
      if (!applied.ok) return { ok: false, error: applied.error, httpStatus: applied.httpStatus, currentStatus: current };
      const { error: uErr } = await sb
        .from("store_order_cancel_requests")
        .update({
          status: "approved",
          approved_by: input.ownerUserId,
          approved_at: new Date().toISOString(),
          refund_status: "pending",
        })
        .eq("id", requestRowId)
        .eq("status", "pending");
      if (uErr) console.error("[owner decision] cancel approve ledger", uErr);
    } else {
      const previous = String((reqRow as { previous_order_status?: unknown }).previous_order_status ?? "").trim();
      if (!ADMIN_CANCEL_REQUEST_RESTORE_STATUSES.has(previous)) {
        return { ok: false, error: "cancel_restore_status_unknown", httpStatus: 409, currentStatus: current };
      }
      toStatus = previous;
      const applied = await applyStoreOrderStatusTransition(sb, {
        orderId: oid,
        nextStatus: toStatus,
        actor: "OWNER",
        restoreToStatus: toStatus,
        eventMessage: reason,
        eventMetadata: { source: "owner_cancel_request_reject", rejected_reason: reason },
        audit: { ...audit, action: "store_order.owner_cancel_request_reject" },
      });
      if (!applied.ok) return { ok: false, error: applied.error, httpStatus: applied.httpStatus, currentStatus: current };
      const { error: uErr } = await sb
        .from("store_order_cancel_requests")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejected_reason: reason,
          refund_status: "not_applicable",
        })
        .eq("id", requestRowId)
        .eq("status", "pending");
      if (uErr) console.error("[owner decision] cancel reject ledger", uErr);
    }
  } else if (input.action === "refund_approve") {
    toStatus = "refunded";
    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: oid,
      nextStatus: toStatus,
      actor: "OWNER",
      eventMetadata: { source: "owner_refund_approve" },
      audit: { ...audit, action: "store_order.owner_refund_approve" },
    });
    if (!applied.ok) return { ok: false, error: applied.error, httpStatus: applied.httpStatus, currentStatus: current };
  } else {
    const restore = await resolveRefundRequestRestoreStatus(sb, oid);
    if (!restore) return { ok: false, error: "refund_restore_status_unknown", httpStatus: 409, currentStatus: current };
    toStatus = restore;
    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: oid,
      nextStatus: toStatus,
      actor: "OWNER",
      restoreToStatus: toStatus,
      eventMessage: reason,
      eventMetadata: { source: "owner_refund_reject", rejected_reason: reason },
      audit: { ...audit, action: "store_order.owner_refund_reject" },
    });
    if (!applied.ok) return { ok: false, error: applied.error, httpStatus: applied.httpStatus, currentStatus: current };
  }

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.owner_decision",
    before_json: { order_status: current },
    after_json: {
      action: input.action,
      order_status: toStatus,
      ...(reason ? { reason } : {}),
      ...(requestRowId ? { cancel_request_id: requestRowId } : {}),
    },
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });

  return { ok: true, fromStatus: current, toStatus };
}
