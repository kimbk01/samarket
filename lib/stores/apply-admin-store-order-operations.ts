import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import {
  ADMIN_CANCEL_REQUEST_RESTORE_STATUSES,
  ADMIN_REFUND_REQUEST_RESTORE_STATUSES,
} from "@/lib/stores/order-status-transitions";
import { invalidateStoreOrderCountsCache } from "@/lib/stores/store-order-counts-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export type AdminOrderOpsAudit = {
  adminUserId: string;
  /** 운영자 처리 사유 (있으면 작업 기록에 남긴다) */
  reason?: string | null;
  ip?: string | null;
  user_agent?: string | null;
};

function invalidateCaches(sb: SupabaseClient, storeId: string, ownerUserId: string | null): void {
  invalidateStoreOrderCountsCache(storeId.trim(), ownerUserId);
  if (ownerUserId) invalidateOwnerHubBadgeCache(ownerUserId);
}

async function loadOwnerUserId(sb: SupabaseClient, storeId: string): Promise<string | null> {
  const { data } = await sb.from("stores").select("owner_user_id").eq("id", storeId.trim()).maybeSingle();
  const id = (data as { owner_user_id?: string } | null)?.owner_user_id;
  return id ? String(id).trim() : null;
}

/**
 * 관리자 강제 취소 — ADMIN actor via applyStoreOrderStatusTransition (no raw order_status write).
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
    .select("id, store_id, order_status")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const os = order.order_status as string;
  const sid = order.store_id as string;

  if (os === "cancelled") return { ok: true };
  if (os === "refunded") return { ok: false, error: "cannot_force_cancel_refunded", httpStatus: 409 };
  if (os === "completed") return { ok: false, error: "cannot_force_cancel_completed", httpStatus: 409 };

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: "cancelled",
    actor: "ADMIN",
    audit: {
      actor_type: "admin",
      actor_id: audit.adminUserId,
      action: "store_order.admin_force_cancel",
      ip: audit.ip ?? null,
      user_agent: audit.user_agent ?? null,
    },
  });
  if (!applied.ok) {
    return { ok: false, error: applied.error, httpStatus: applied.httpStatus };
  }

  const ownerId = await loadOwnerUserId(sb, sid);
  invalidateCaches(sb, sid, ownerId);
  return { ok: true };
}

/**
 * 관리자가 환불 요청 상태로 설정.
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
    .select("id, store_id, order_status")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const os = order.order_status as string;
  const sid = order.store_id as string;

  if (os === "refund_requested") return { ok: true };
  if (os === "refunded") return { ok: false, error: "already_refunded", httpStatus: 409 };

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: "refund_requested",
    actor: "ADMIN",
    audit: {
      actor_type: "admin",
      actor_id: audit.adminUserId,
      action: "store_order.admin_set_refund_requested",
      ip: audit.ip ?? null,
      user_agent: audit.user_agent ?? null,
    },
  });
  if (!applied.ok) {
    const err =
      applied.error === "invalid_transition" ? "cannot_set_refund_requested_for_status" : applied.error;
    return { ok: false, error: err, httpStatus: applied.httpStatus };
  }

  const ownerId = await loadOwnerUserId(sb, sid);
  invalidateCaches(sb, sid, ownerId);
  return { ok: true };
}

export async function adminApproveStoreOrderCancelRequest(
  sb: SupabaseClient,
  orderId: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const { data: reqRow, error: rErr } = await sb
    .from("store_order_cancel_requests")
    .select("id, status, previous_order_status")
    .eq("order_id", oid)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message, httpStatus: 500 };
  if (!reqRow?.id) return { ok: false, error: "cancel_request_not_found", httpStatus: 404 };

  const force = await adminForceCancelStoreOrder(sb, oid, audit);
  if (!force.ok) return force;

  // Ledger follows the order CAS; only a still-pending request is closed.
  const { error: uReqErr } = await sb
    .from("store_order_cancel_requests")
    .update({
      status: "approved",
      approved_by: audit.adminUserId,
      approved_at: new Date().toISOString(),
      refund_status: "pending",
    })
    .eq("id", reqRow.id as string)
    .eq("status", "pending");
  if (uReqErr) console.error("[adminApproveStoreOrderCancelRequest] ledger", uReqErr);

  // cancel_approved event emitted inside apply (cancel_requested → cancelled)
  return { ok: true };
}

export async function adminRejectStoreOrderCancelRequest(
  sb: SupabaseClient,
  orderId: string,
  rejectedReason: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const { data: reqRow, error: rErr } = await sb
    .from("store_order_cancel_requests")
    .select("id, status, previous_order_status")
    .eq("order_id", oid)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message, httpStatus: 500 };
  if (!reqRow?.id) return { ok: false, error: "cancel_request_not_found", httpStatus: 404 };

  const reason = rejectedReason.trim().slice(0, 500) || "Rejected by admin";
  const previousStatus =
    typeof (reqRow as { previous_order_status?: unknown }).previous_order_status === "string" &&
    (reqRow as { previous_order_status?: string }).previous_order_status?.trim()
      ? (reqRow as { previous_order_status: string }).previous_order_status.trim()
      : "preparing";

  if (!ADMIN_CANCEL_REQUEST_RESTORE_STATUSES.has(previousStatus)) {
    return { ok: false, error: "invalid_previous_order_status", httpStatus: 400 };
  }

  // Recovery Chain: apply first — ledger update only after CAS success
  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: previousStatus,
    actor: "ADMIN",
    restoreToStatus: previousStatus,
    eventMessage: reason,
    eventMetadata: { source: "admin_cancel_request_reject", rejected_reason: reason },
    audit: {
      actor_type: "admin",
      actor_id: audit.adminUserId,
      action: "store_order.admin_reject_cancel_request",
      ip: audit.ip ?? null,
      user_agent: audit.user_agent ?? null,
    },
  });
  if (!applied.ok) {
    return { ok: false, error: applied.error, httpStatus: applied.httpStatus };
  }

  const { error: uReqErr } = await sb
    .from("store_order_cancel_requests")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_reason: reason,
      refund_status: "not_applicable",
    })
    .eq("id", reqRow.id as string)
    .eq("status", "pending");
  if (uReqErr) return { ok: false, error: uReqErr.message, httpStatus: 500 };

  const ownerId = await loadOwnerUserId(sb, order.store_id as string);
  invalidateCaches(sb, order.store_id as string, ownerId);
  return { ok: true };
}

export type AdminStoreOrderMetaPatch = {
  admin_locked?: boolean;
  admin_flagged?: boolean;
  admin_note?: string | null;
  dispute_status?: string | null;
  needs_admin_attention?: boolean;
};

/** Meta fields that must carry the `updated_at` the admin saw (overwrite = lost update). */
export const ADMIN_STORE_ORDER_META_CAS_REQUIRED_FIELDS = ["admin_locked", "admin_flagged", "dispute_status"] as const;

/** Postgres timestamptz text → comparable microseconds (null when unparsable). */
export function adminOrderTimestampMicros(raw: unknown): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
  if (!m) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms * 1000 : null;
  }
  let tz = m[4] ?? "Z";
  if (/^[+-]\d{2}$/.test(tz)) tz = `${tz}:00`;
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const baseMs = Date.parse(`${m[1]}T${m[2]}${tz.toUpperCase() === "Z" ? "Z" : tz}`);
  if (!Number.isFinite(baseMs)) return null;
  const micros = Number((m[3] ?? "").padEnd(6, "0").slice(0, 6)) || 0;
  return baseMs * 1000 + micros;
}

export function sameAdminOrderTimestamp(a: unknown, b: unknown): boolean {
  const x = adminOrderTimestampMicros(a);
  const y = adminOrderTimestampMicros(b);
  return x != null && y != null && x === y;
}

/**
 * 관리자 플래그·메모만 수선 — order_status 비변경.
 * Concurrency: with `expectedUpdatedAt` the write is conditional on the row's `updated_at`
 * (pre-check + `.eq("updated_at", …)` on the write) → 409 `stale_updated_at` when another
 * admin changed it first. Lock / review mark / urgent require it (see CAS_REQUIRED_FIELDS).
 * Every write bumps `updated_at` so the next editor's condition sees this change.
 */
export async function adminPatchStoreOrderMeta(
  sb: SupabaseClient,
  orderId: string,
  patch: AdminStoreOrderMetaPatch,
  audit: AdminOrderOpsAudit,
  opts: { expectedUpdatedAt?: string | null } = {}
): Promise<
  | { ok: true; updatedAt: string }
  | { ok: false; error: string; httpStatus: number; currentUpdatedAt?: string | null }
> {
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

  const expected = String(opts.expectedUpdatedAt ?? "").trim();
  if (!expected && ADMIN_STORE_ORDER_META_CAS_REQUIRED_FIELDS.some((f) => f in row)) {
    return { ok: false, error: "expected_updated_at_required", httpStatus: 400 };
  }

  const { data: before, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, admin_locked, admin_flagged, admin_note, dispute_status, needs_admin_attention, updated_at"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !before) return { ok: false, error: "order_not_found", httpStatus: 404 };

  const beforeUpdatedAt = typeof before.updated_at === "string" ? before.updated_at : null;
  if (expected && !sameAdminOrderTimestamp(beforeUpdatedAt, expected)) {
    return { ok: false, error: "stale_updated_at", httpStatus: 409, currentUpdatedAt: beforeUpdatedAt };
  }

  const nowIso = new Date().toISOString();
  row.updated_at = nowIso;
  let write = sb.from("store_orders").update(row).eq("id", oid);
  // The DB's own text for the value we just checked → exact match on the write (CAS).
  if (expected && beforeUpdatedAt) write = write.eq("updated_at", beforeUpdatedAt);
  const { data: written, error: uErr } = await write.select("id, updated_at");
  if (uErr) {
    const missing =
      /admin_locked|admin_flagged|admin_note|refund_approved_at|refunded_at|dispute_status|needs_admin_attention/i.test(
        String(uErr.message)
      ) && /does not exist/i.test(String(uErr.message));
    if (missing) {
      return { ok: false, error: "admin_columns_missing_apply_migration", httpStatus: 503 };
    }
    console.error("[adminPatchStoreOrderMeta]", uErr);
    return { ok: false, error: "db_error", httpStatus: 500 };
  }
  const writtenRow = Array.isArray(written) ? (written[0] as { updated_at?: unknown } | undefined) : undefined;
  if (!writtenRow) {
    // Someone else wrote between our read and write.
    return { ok: false, error: "stale_updated_at", httpStatus: 409, currentUpdatedAt: beforeUpdatedAt };
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: audit.adminUserId,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.admin_patch_meta",
    before_json: before as Record<string, unknown>,
    after_json: audit.reason ? { ...row, reason: audit.reason } : row,
    ip: audit.ip ?? null,
    user_agent: audit.user_agent ?? null,
  });

  const sid = before.store_id as string;
  const ownerId = await loadOwnerUserId(sb, sid);
  invalidateCaches(sb, sid, ownerId);
  return { ok: true, updatedAt: typeof writtenRow.updated_at === "string" ? writtenRow.updated_at : nowIso };
}

/** 환불 완료 — apply ADMIN → refunded */
export async function adminCompleteRefundStoreOrder(
  sb: SupabaseClient,
  orderId: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, payment_status")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  if (order.order_status === "refunded" && order.payment_status === "refunded") {
    return { ok: true, already: true };
  }

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: "refunded",
    actor: "ADMIN",
    audit: {
      actor_type: "admin",
      actor_id: audit.adminUserId,
      action: "store_order.admin_complete_refund",
      ip: audit.ip ?? null,
      user_agent: audit.user_agent ?? null,
    },
  });
  if (!applied.ok) {
    const err = applied.error === "invalid_transition" ? "refund_not_requested" : applied.error;
    return { ok: false, error: err, httpStatus: applied.httpStatus };
  }

  const sid = String(order.store_id ?? "").trim();
  if (sid) {
    const ownerId = await loadOwnerUserId(sb, sid);
    invalidateCaches(sb, sid, ownerId);
  }

  return { ok: true, already: applied.idempotent };
}

/**
 * Admin rejects buyer/admin refund request — restore prior business status.
 * No refund money/gift/stock side effects (not cancelled / not refunded).
 */
export async function adminRejectRefundStoreOrder(
  sb: SupabaseClient,
  orderId: string,
  restoreToStatus: string,
  reason: string,
  audit: AdminOrderOpsAudit
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };

  const restore = restoreToStatus.trim();
  if (!ADMIN_REFUND_REQUEST_RESTORE_STATUSES.has(restore)) {
    return { ok: false, error: "invalid_restore_status", httpStatus: 400 };
  }

  const rejectedReason = reason.trim().slice(0, 500) || "Refund request rejected by admin";

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };

  if (order.order_status !== "refund_requested") {
    return { ok: false, error: "refund_not_requested", httpStatus: 409 };
  }

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: restore,
    actor: "ADMIN",
    restoreToStatus: restore,
    eventMessage: rejectedReason,
    eventMetadata: { source: "admin_refund_reject", rejected_reason: rejectedReason },
    audit: {
      actor_type: "admin",
      actor_id: audit.adminUserId,
      action: "store_order.admin_reject_refund",
      ip: audit.ip ?? null,
      user_agent: audit.user_agent ?? null,
    },
  });
  if (!applied.ok) {
    return { ok: false, error: applied.error, httpStatus: applied.httpStatus };
  }

  const sid = String(order.store_id ?? "").trim();
  if (sid) {
    const ownerId = await loadOwnerUserId(sb, sid);
    invalidateCaches(sb, sid, ownerId);
  }
  return { ok: true };
}
