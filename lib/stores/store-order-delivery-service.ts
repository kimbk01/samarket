import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { allowedDeliveryTransitions, isValidDeliveryStatus, type StoreOrderDeliveryStatus } from "@/lib/stores/store-order-delivery-status";

export type StoreOrderDeliveryRow = {
  order_id: string;
  store_id: string;
  buyer_user_id: string;
  rider_id?: string | null;
  delivery_status: StoreOrderDeliveryStatus;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  admin_note?: string | null;
  failure_reason?: string | null;
  rider_accepted_at?: string | null;
  customer_arrived_at?: string | null;
  rider_decline_reason?: string | null;
  delivered_proof_image_path?: string | null;
  delivered_proof_image_url?: string | null;
  delivered_proof_note?: string | null;
  delivered_receiver_name?: string | null;
  delivered_confirmed_at?: string | null;
  delivered_proof_lat?: number | null;
  delivered_proof_lng?: number | null;
  failure_proof_image_path?: string | null;
  failure_proof_image_url?: string | null;
  failure_note?: string | null;
  rider_failure_reported_at?: string | null;
  rider_failure_report_reason?: string | null;
  failure_report_lat?: number | null;
  failure_report_lng?: number | null;
  failed_at?: string | null;
  updated_at?: string | null;
};

export type DeliveryPatchResult =
  | { ok: true; row: StoreOrderDeliveryRow; previous_status: StoreOrderDeliveryStatus }
  | { ok: false; error: string; httpStatus: number };

function nowIso(): string {
  return new Date().toISOString();
}

function safeTrim(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function clampNote(x: unknown): string | null {
  const t = safeTrim(x);
  if (!t) return null;
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

function clampFailureReason(x: unknown): string | null {
  const t = safeTrim(x);
  if (!t) return null;
  return t.length > 2000 ? t.slice(0, 2000) : t;
}

function clampReceiverName(x: unknown): string | null {
  const t = safeTrim(x);
  if (!t) return null;
  return t.length > 120 ? t.slice(0, 120) : t;
}

function clampReportReason(x: unknown): string | null {
  const t = safeTrim(x);
  if (!t) return null;
  return t.length > 500 ? t.slice(0, 500) : t;
}

/** POD·실패 증빙 URL — https 공개 URL만 (레거시 호환) */
export function sanitizeDeliveryProofImageUrl(u: unknown): string | null {
  const t = safeTrim(u);
  if (!t || t.length > 2048) return null;
  if (!/^https:\/\//i.test(t)) return null;
  return t;
}

/**
 * POD 객체 경로 — 업로드 API가 반환한 상대 경로만 허용 (주문 ID 접두 일치, 경로 탈출 금지).
 */
export function sanitizeDeliveryProofStoragePath(orderId: string, p: unknown): string | null {
  const oid = safeTrim(orderId);
  const t = safeTrim(p);
  if (!oid || !t || t.length > 520) return null;
  if (t.includes("..") || t.includes("\\")) return null;
  const prefix = `store-deliveries/${oid}/`;
  if (!t.startsWith(prefix)) return null;
  const tail = t.slice(prefix.length);
  if (!tail || tail.length > 400) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(tail)) return null;
  return t;
}

function mergeProofClears(patch: Record<string, unknown>): void {
  patch.delivered_proof_image_path = null;
  patch.delivered_proof_image_url = null;
  patch.delivered_proof_note = null;
  patch.delivered_receiver_name = null;
  patch.delivered_confirmed_at = null;
  patch.delivered_proof_lat = null;
  patch.delivered_proof_lng = null;
  patch.failure_proof_image_path = null;
  patch.failure_proof_image_url = null;
  patch.failure_note = null;
  patch.rider_failure_reported_at = null;
  patch.rider_failure_report_reason = null;
  patch.failure_report_lat = null;
  patch.failure_report_lng = null;
  patch.failed_at = null;
}

export const STORE_ORDER_DELIVERY_ROW_SELECT =
  "order_id, store_id, buyer_user_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, admin_note, failure_reason, rider_accepted_at, customer_arrived_at, rider_decline_reason, delivered_proof_image_path, delivered_proof_image_url, delivered_proof_note, delivered_receiver_name, delivered_confirmed_at, delivered_proof_lat, delivered_proof_lng, failure_proof_image_path, failure_proof_image_url, failure_note, rider_failure_reported_at, rider_failure_report_reason, failure_report_lat, failure_report_lng, failed_at, updated_at";

const DELIVERY_ROW_SELECT = STORE_ORDER_DELIVERY_ROW_SELECT;

async function assertRiderAssignable(
  sb: SupabaseClient,
  riderId: string,
  allowOffline: boolean
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const { data: r, error } = await sb
    .from("delivery_riders")
    .select("id, is_online, suspended_at, admin_status")
    .eq("id", riderId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|column/i.test(msg)) {
      return { ok: false, error: "rider_schema_missing_apply_migration", httpStatus: 503 };
    }
    return { ok: false, error: msg.slice(0, 200), httpStatus: 500 };
  }
  if (!r) return { ok: false, error: "rider_not_found", httpStatus: 404 };
  const row = r as {
    suspended_at?: string | null;
    admin_status?: string | null;
    is_online?: boolean | null;
  };
  if (row.suspended_at) return { ok: false, error: "rider_suspended", httpStatus: 409 };
  if (row.admin_status === "paused") return { ok: false, error: "rider_paused", httpStatus: 409 };
  if (!allowOffline && !row.is_online) return { ok: false, error: "rider_offline", httpStatus: 409 };
  return { ok: true };
}

async function loadOrderGuard(sb: SupabaseClient, orderId: string): Promise<
  | { ok: true; store_id: string; buyer_user_id: string; order_status: string; admin_locked: boolean }
  | { ok: false; error: string; httpStatus: number }
> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id", httpStatus: 400 };
  const { data: order, error } = await sb
    .from("store_orders")
    .select("id, store_id, buyer_user_id, order_status, admin_locked")
    .eq("id", oid)
    .maybeSingle();
  if (error || !order) return { ok: false, error: "order_not_found", httpStatus: 404 };
  return {
    ok: true,
    store_id: safeTrim(order.store_id),
    buyer_user_id: safeTrim(order.buyer_user_id),
    order_status: safeTrim(order.order_status),
    admin_locked: (order as { admin_locked?: boolean }).admin_locked === true,
  };
}

function orderBlocksDelivery(orderStatus: string): boolean {
  return ["cancelled", "refunded", "completed"].includes(orderStatus);
}

function orderAllowsDispatch(orderStatus: string): boolean {
  return ["ready_for_pickup", "delivering", "arrived"].includes(orderStatus);
}

async function ensureDeliveryRow(
  sb: SupabaseClient,
  opts: { orderId: string; storeId: string; buyerUserId: string }
): Promise<{ ok: true; row: StoreOrderDeliveryRow } | { ok: false; error: string; httpStatus: number }> {
  const { data: existing, error: eErr } = await sb
    .from("store_order_deliveries")
    .select(DELIVERY_ROW_SELECT)
    .eq("order_id", opts.orderId)
    .maybeSingle();
  if (eErr) {
    if (/store_order_deliveries/i.test(String(eErr.message)) && /does not exist/i.test(String(eErr.message))) {
      return { ok: false, error: "schema_missing_store_order_deliveries", httpStatus: 503 };
    }
    return { ok: false, error: eErr.message, httpStatus: 500 };
  }
  if (existing) return { ok: true, row: existing as unknown as StoreOrderDeliveryRow };

  const insertRow: Record<string, unknown> = {
    order_id: opts.orderId,
    store_id: opts.storeId,
    buyer_user_id: opts.buyerUserId,
    delivery_status: "waiting_rider",
  };
  const { data: created, error: cErr } = await sb
    .from("store_order_deliveries")
    .insert(insertRow)
    .select(DELIVERY_ROW_SELECT)
    .maybeSingle();
  if (cErr || !created) {
    return { ok: false, error: cErr?.message ?? "create_failed", httpStatus: 500 };
  }
  return { ok: true, row: created as unknown as StoreOrderDeliveryRow };
}

export async function adminPatchStoreOrderDelivery(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    adminUserId: string;
    ip?: string | null;
    user_agent?: string | null;
    assignRiderId?: string | null;
    /** 기존 라이더가 있을 때 교체(관리자 전용). assign_rider_id 와 동시 사용 불가 */
    reassignRiderId?: string | null;
    setStatus?: string | null;
    adminNote?: unknown;
    failureReason?: string | null;
    /** 미배차 행인데 rider_id 가 남아 있을 때 정리 */
    clearWaitingOrphanRider?: boolean;
    /** 관리자 전용: rider_assigned → waiting_rider + 라이더 해제 */
    releaseFromAssigned?: boolean;
    /** delivery_failed → waiting_rider 전환 시 라이더 컬럼까지 비움 */
    clearRiderForWaiting?: boolean;
    /** 오프라인·paused·suspended 라이더 배차 허용 */
    allowOfflineAssign?: boolean;
  }
): Promise<DeliveryPatchResult> {
  const guard = await loadOrderGuard(sb, opts.orderId);
  if (!guard.ok) return guard;
  if (orderBlocksDelivery(guard.order_status)) {
    return { ok: false, error: "order_terminal_blocks_delivery", httpStatus: 409 };
  }

  const ensured = await ensureDeliveryRow(sb, {
    orderId: opts.orderId.trim(),
    storeId: guard.store_id,
    buyerUserId: guard.buyer_user_id,
  });
  if (!ensured.ok) return ensured;

  const prev = ensured.row.delivery_status;
  const patch: Record<string, unknown> = {};

  const assignPlain = safeTrim(opts.assignRiderId);
  const reassign = safeTrim(opts.reassignRiderId);
  if (assignPlain && reassign) {
    return { ok: false, error: "conflicting_rider_fields", httpStatus: 400 };
  }

  if ((assignPlain || reassign) && prev === "delivered") {
    return { ok: false, error: "delivery_already_delivered", httpStatus: 409 };
  }

  if (
    (assignPlain || reassign) &&
    (opts.releaseFromAssigned === true || opts.clearWaitingOrphanRider === true)
  ) {
    return { ok: false, error: "conflicting_assignment_actions", httpStatus: 400 };
  }

  const allowOff = opts.allowOfflineAssign === true;

  if (opts.clearWaitingOrphanRider === true) {
    if (prev !== "waiting_rider") {
      return { ok: false, error: "clear_waiting_only_waiting_status", httpStatus: 409 };
    }
    if (!ensured.row.rider_id) {
      return { ok: false, error: "nothing_to_clear", httpStatus: 400 };
    }
    patch.rider_id = null;
    patch.assigned_at = null;
    patch.rider_accepted_at = null;
    patch.customer_arrived_at = null;
    patch.rider_decline_reason = null;
    mergeProofClears(patch);
  }

  if (opts.releaseFromAssigned === true) {
    if (prev !== "rider_assigned") {
      return { ok: false, error: "release_from_assigned_only", httpStatus: 409 };
    }
    patch.delivery_status = "waiting_rider";
    patch.rider_id = null;
    patch.assigned_at = null;
    patch.rider_accepted_at = null;
    patch.customer_arrived_at = null;
    patch.rider_decline_reason = null;
    mergeProofClears(patch);
  }

  if (reassign) {
    const vr = await assertRiderAssignable(sb, reassign, allowOff);
    if (!vr.ok) return vr;
    const cur = safeTrim(ensured.row.rider_id);
    if (!cur) {
      patch.rider_id = reassign;
      patch.assigned_at = ensured.row.assigned_at ?? nowIso();
      if (prev === "waiting_rider") patch.delivery_status = "rider_assigned";
      patch.rider_accepted_at = null;
      patch.customer_arrived_at = null;
      patch.rider_decline_reason = null;
      mergeProofClears(patch);
    } else if (cur !== reassign) {
      patch.rider_id = reassign;
      patch.assigned_at = nowIso();
      patch.rider_accepted_at = null;
      patch.customer_arrived_at = null;
      patch.rider_decline_reason = null;
      mergeProofClears(patch);
    }
  }

  const riderId = assignPlain;
  if (riderId && !reassign) {
    const vr = await assertRiderAssignable(sb, riderId, allowOff);
    if (!vr.ok) return vr;
    if (ensured.row.rider_id && safeTrim(ensured.row.rider_id) !== riderId) {
      return { ok: false, error: "rider_already_assigned", httpStatus: 409 };
    }
    patch.rider_id = riderId;
    patch.assigned_at = ensured.row.assigned_at ?? nowIso();
    if (prev === "waiting_rider") {
      patch.delivery_status = "rider_assigned";
      patch.rider_accepted_at = null;
      patch.customer_arrived_at = null;
      patch.rider_decline_reason = null;
      mergeProofClears(patch);
    }
  }

  const desiredRaw = safeTrim(opts.setStatus);
  if (desiredRaw) {
    if (!isValidDeliveryStatus(desiredRaw)) {
      return { ok: false, error: "invalid_delivery_status", httpStatus: 400 };
    }

    const allowed = allowedDeliveryTransitions(prev);

    if (!allowed.includes(desiredRaw)) {
      return { ok: false, error: "invalid_delivery_transition", httpStatus: 400 };
    }
    if (!orderAllowsDispatch(guard.order_status) && desiredRaw !== "delivery_failed") {
      return { ok: false, error: "order_status_blocks_dispatch", httpStatus: 409 };
    }
    patch.delivery_status = desiredRaw;
    if (desiredRaw === "waiting_rider" && opts.clearRiderForWaiting === true) {
      patch.rider_id = null;
      patch.assigned_at = null;
      patch.rider_accepted_at = null;
      patch.customer_arrived_at = null;
      patch.rider_decline_reason = null;
      mergeProofClears(patch);
    }
    if (desiredRaw === "delivery_failed") {
      patch.failure_reason = clampFailureReason(opts.failureReason) ?? "delivery_failed";
      patch.failed_at = nowIso();
    }
    if (desiredRaw === "pickup_in_progress" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
    if (desiredRaw === "delivering" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
    if (desiredRaw === "delivered" && !ensured.row.delivered_at) patch.delivered_at = nowIso();
  }

  const note = clampNote(opts.adminNote);
  if (opts.adminNote !== undefined) {
    patch.admin_note = note;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "empty_delivery_patch", httpStatus: 400 };
  }

  const { data: updated, error: uErr } = await sb
    .from("store_order_deliveries")
    .update(patch)
    .eq("order_id", opts.orderId.trim())
    .select(DELIVERY_ROW_SELECT)
    .maybeSingle();

  if (uErr || !updated) {
    const msg = String(uErr?.message ?? "");
    if (/failure_reason/i.test(msg) && /does not exist/i.test(msg)) {
      return { ok: false, error: "failure_reason_column_missing_apply_migration", httpStatus: 503 };
    }
    return { ok: false, error: uErr?.message ?? "update_failed", httpStatus: 500 };
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: opts.adminUserId,
    target_type: "store_order",
    target_id: opts.orderId.trim(),
    action: "store_order.delivery.admin_patch",
    before_json: { delivery_status: prev, rider_id: ensured.row.rider_id ?? null },
    after_json: patch,
    ip: opts.ip ?? null,
    user_agent: opts.user_agent ?? null,
  });

  return { ok: true, row: updated as unknown as StoreOrderDeliveryRow, previous_status: prev };
}

/**
 * 관리자 라이더 해제: 진행 단계별로 허용 전이만 사용 (머신 규칙 준수).
 */
export async function adminOrchestrateDeliveryRelease(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    adminUserId: string;
    ip?: string | null;
    user_agent?: string | null;
    failureReason?: string | null;
  }
): Promise<DeliveryPatchResult> {
  const oid = opts.orderId.trim();
  const { data: row, error } = await sb
    .from("store_order_deliveries")
    .select("delivery_status")
    .eq("order_id", oid)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  const st = safeTrim((row as { delivery_status?: string } | null)?.delivery_status);
  const common = {
    orderId: oid,
    adminUserId: opts.adminUserId,
    ip: opts.ip,
    user_agent: opts.user_agent,
  };

  if (st === "waiting_rider") {
    return adminPatchStoreOrderDelivery(sb, {
      ...common,
      clearWaitingOrphanRider: true,
    });
  }
  if (st === "rider_assigned") {
    return adminPatchStoreOrderDelivery(sb, {
      ...common,
      releaseFromAssigned: true,
    });
  }
  if (st === "pickup_in_progress" || st === "delivering") {
    const r1 = await adminPatchStoreOrderDelivery(sb, {
      ...common,
      setStatus: "delivery_failed",
      failureReason: opts.failureReason ?? "admin_release_from_progress",
    });
    if (!r1.ok) return r1;
    return adminPatchStoreOrderDelivery(sb, {
      ...common,
      setStatus: "waiting_rider",
      clearRiderForWaiting: true,
    });
  }
  if (st === "delivery_failed") {
    return adminPatchStoreOrderDelivery(sb, {
      ...common,
      setStatus: "waiting_rider",
      clearRiderForWaiting: true,
    });
  }
  return { ok: false, error: "release_not_applicable_for_status", httpStatus: 409 };
}

export async function ownerPatchStoreOrderDelivery(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    storeId: string;
    ownerUserId: string;
    ip?: string | null;
    user_agent?: string | null;
    setStatus?: string | null;
  }
): Promise<DeliveryPatchResult> {
  const guard = await loadOrderGuard(sb, opts.orderId);
  if (!guard.ok) return guard;
  if (guard.admin_locked) return { ok: false, error: "order_admin_locked", httpStatus: 409 };
  if (guard.store_id !== opts.storeId.trim()) return { ok: false, error: "store_mismatch", httpStatus: 403 };
  if (!orderAllowsDispatch(guard.order_status)) return { ok: false, error: "order_status_blocks_dispatch", httpStatus: 409 };
  if (orderBlocksDelivery(guard.order_status)) return { ok: false, error: "order_terminal_blocks_delivery", httpStatus: 409 };

  const ensured = await ensureDeliveryRow(sb, {
    orderId: opts.orderId.trim(),
    storeId: guard.store_id,
    buyerUserId: guard.buyer_user_id,
  });
  if (!ensured.ok) return ensured;

  const prev = ensured.row.delivery_status;
  const desiredRaw = safeTrim(opts.setStatus);
  if (!desiredRaw) return { ok: false, error: "missing_delivery_status", httpStatus: 400 };
  if (!isValidDeliveryStatus(desiredRaw)) return { ok: false, error: "invalid_delivery_status", httpStatus: 400 };
  const allowed = allowedDeliveryTransitions(prev);
  if (!allowed.includes(desiredRaw)) return { ok: false, error: "invalid_delivery_transition", httpStatus: 400 };

  const patch: Record<string, unknown> = { delivery_status: desiredRaw };
  if (desiredRaw === "pickup_in_progress" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
  if (desiredRaw === "delivering" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
  if (desiredRaw === "delivered" && !ensured.row.delivered_at) patch.delivered_at = nowIso();

  const { data: updated, error: uErr } = await sb
    .from("store_order_deliveries")
    .update(patch)
    .eq("order_id", opts.orderId.trim())
    .eq("store_id", opts.storeId.trim())
    .select(DELIVERY_ROW_SELECT)
    .maybeSingle();
  if (uErr || !updated) return { ok: false, error: uErr?.message ?? "update_failed", httpStatus: 500 };

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: opts.ownerUserId,
    target_type: "store_order",
    target_id: opts.orderId.trim(),
    action: "store_order.delivery.owner_patch",
    before_json: { delivery_status: prev },
    after_json: patch,
    ip: opts.ip ?? null,
    user_agent: opts.user_agent ?? null,
  });

  return { ok: true, row: updated as unknown as StoreOrderDeliveryRow, previous_status: prev };
}

const RIDER_SELF_ROW_SELECT =
  "id, user_id, is_online, rider_status, suspended_at, admin_status, current_lat, current_lng, last_active_at";

export type DeliveryRiderSelfRow = {
  id: string;
  user_id: string | null;
  is_online: boolean | null;
  rider_status: string | null;
  suspended_at?: string | null;
  admin_status?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  last_active_at?: string | null;
};

const RIDER_APP_DELIVERY_COL_KEYS =
  /rider_accepted_at|customer_arrived_at|rider_decline_reason|delivered_proof|failure_proof|rider_failure_reported|failure_report|failed_at/i;

function clampDeclineReason(x: unknown): string | null {
  const t = safeTrim(x);
  if (!t) return null;
  return t.length > 500 ? t.slice(0, 500) : t;
}

/** 라이더 앱: 세션 사용자 UID 로 등록된 delivery_riders 행 조회 */
export async function getDeliveryRiderForUser(
  sb: SupabaseClient,
  userId: string
): Promise<{ ok: true; rider: DeliveryRiderSelfRow } | { ok: false; error: string; httpStatus: number }> {
  const uid = safeTrim(userId);
  if (!uid) return { ok: false, error: "missing_user_id", httpStatus: 400 };
  const { data: r, error } = await sb
    .from("delivery_riders")
    .select(RIDER_SELF_ROW_SELECT)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|column/i.test(msg)) {
      return { ok: false, error: "rider_schema_missing_apply_migration", httpStatus: 503 };
    }
    return { ok: false, error: msg.slice(0, 200), httpStatus: 500 };
  }
  if (!r) return { ok: false, error: "rider_profile_not_found", httpStatus: 404 };
  return { ok: true, rider: r as DeliveryRiderSelfRow };
}

const RIDER_STATUS_ALLOWED = new Set(["active", "delivering", "on_break"]);

/** 라이더 본인: 온라인·모드(rider_status) 변경 — 관리자 정지와 무관하게 거부는 별도(함수 내 처리). */
export async function riderSelfPatchPresence(
  sb: SupabaseClient,
  opts: {
    riderUserId: string;
    is_online?: boolean;
    rider_status?: string | null;
    ip?: string | null;
    user_agent?: string | null;
  }
): Promise<
  | { ok: true; rider: DeliveryRiderSelfRow }
  | { ok: false; error: string; httpStatus: number }
> {
  const uid = safeTrim(opts.riderUserId);
  if (!uid) return { ok: false, error: "missing_user_id", httpStatus: 400 };

  const gate = await getDeliveryRiderForUser(sb, uid);
  if (!gate.ok) return gate;
  const rr = gate.rider.id;

  const patch: Record<string, unknown> = {};
  if (typeof opts.is_online === "boolean") patch.is_online = opts.is_online;
  const rs = safeTrim(opts.rider_status);
  if (opts.rider_status !== undefined) {
    if (rs && !RIDER_STATUS_ALLOWED.has(rs)) {
      return { ok: false, error: "invalid_rider_status", httpStatus: 400 };
    }
    patch.rider_status = rs || "active";
  }
  patch.last_active_at = nowIso();

  const { data: updated, error: uErr } = await sb
    .from("delivery_riders")
    .update(patch)
    .eq("id", rr)
    .eq("user_id", uid)
    .select(RIDER_SELF_ROW_SELECT)
    .maybeSingle();

  if (uErr || !updated) {
    return { ok: false, error: uErr?.message ?? "update_failed", httpStatus: 500 };
  }

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: uid,
    target_type: "delivery_rider",
    target_id: rr,
    action: "delivery_rider.self_presence",
    after_json: patch,
    ip: opts.ip ?? null,
    user_agent: opts.user_agent ?? null,
  });

  return { ok: true, rider: updated as DeliveryRiderSelfRow };
}

export async function riderSelfPostLocation(
  sb: SupabaseClient,
  opts: {
    riderUserId: string;
    lat: number;
    lng: number;
    ip?: string | null;
    user_agent?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const uid = safeTrim(opts.riderUserId);
  if (!uid) return { ok: false, error: "missing_user_id", httpStatus: 400 };
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: "invalid_lat_lng", httpStatus: 400 };
  }

  const gate = await getDeliveryRiderForUser(sb, uid);
  if (!gate.ok) return gate;
  if (gate.rider.suspended_at) return { ok: false, error: "rider_suspended", httpStatus: 409 };

  const rr = gate.rider.id;

  const { error: uErr } = await sb
    .from("delivery_riders")
    .update({
      current_lat: lat,
      current_lng: lng,
      last_active_at: nowIso(),
    })
    .eq("id", rr)
    .eq("user_id", uid);

  if (uErr) return { ok: false, error: uErr.message, httpStatus: 500 };

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: uid,
    target_type: "delivery_rider",
    target_id: rr,
    action: "delivery_rider.location_push",
    after_json: { lat, lng },
    ip: opts.ip ?? null,
    user_agent: opts.user_agent ?? null,
  });

  return { ok: true };
}

export type RiderDeliverPodPayload = {
  /** 비공개 버킷 객체 경로 (권장) */
  delivered_proof_image_path?: string | null;
  /** 레거시 공개 URL (신규 플로우에서는 미사용) */
  delivered_proof_image_url?: string | null;
  delivered_proof_note?: string | null;
  delivered_receiver_name?: string | null;
  delivered_proof_lat?: number | null;
  delivered_proof_lng?: number | null;
};

type RiderDeliveryAction =
  | { type: "accept" }
  | { type: "decline"; reason?: string | null }
  | { type: "set_delivery_status"; delivery_status: string; pod?: RiderDeliverPodPayload | null }
  | { type: "customer_arrived" }
  | {
      type: "report_delivery_failure";
      reason: string;
      note?: string | null;
      failure_proof_image_path?: string | null;
      failure_proof_image_url?: string | null;
      lat?: number | null;
      lng?: number | null;
    };

function redactDeliveryProofAuditPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const o = { ...patch };
  if (typeof o.delivered_proof_image_url === "string") o.delivered_proof_image_url = "[redacted]";
  if (typeof o.failure_proof_image_url === "string") o.failure_proof_image_url = "[redacted]";
  if (typeof o.delivered_proof_image_path === "string") o.delivered_proof_image_path = "[path_redacted]";
  if (typeof o.failure_proof_image_path === "string") o.failure_proof_image_path = "[path_redacted]";
  return o;
}

function redactRiderDeliveryActionForAudit(action: RiderDeliveryAction): unknown {
  if (action.type === "set_delivery_status" && action.pod) {
    return {
      type: action.type,
      delivery_status: action.delivery_status,
      pod: {
        delivered_proof_image_path: action.pod.delivered_proof_image_path ? "[path_redacted]" : undefined,
        delivered_proof_image_url: action.pod.delivered_proof_image_url ? "[redacted]" : undefined,
        delivered_proof_note: action.pod.delivered_proof_note ? "[present]" : undefined,
        delivered_receiver_name: action.pod.delivered_receiver_name ? "[present]" : undefined,
        delivered_proof_lat: action.pod.delivered_proof_lat,
        delivered_proof_lng: action.pod.delivered_proof_lng,
      },
    };
  }
  if (action.type === "report_delivery_failure") {
    return {
      type: action.type,
      reason: action.reason,
      note: action.note ? "[present]" : undefined,
      failure_proof_image_path: action.failure_proof_image_path ? "[path_redacted]" : undefined,
      failure_proof_image_url: action.failure_proof_image_url ? "[redacted]" : undefined,
      lat: action.lat,
      lng: action.lng,
    };
  }
  return action;
}

/** 라이더 본인 배달 행 패치 — 허용 전이만, 동시성은 이전 delivery_status 일치 조건 */
export async function riderPatchStoreOrderDelivery(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    riderUserId: string;
    ip?: string | null;
    user_agent?: string | null;
    action: RiderDeliveryAction;
  }
): Promise<DeliveryPatchResult> {
  const oid = safeTrim(opts.orderId);
  const uid = safeTrim(opts.riderUserId);
  if (!oid || !uid) return { ok: false, error: "missing_ids", httpStatus: 400 };

  const riderGate = await getDeliveryRiderForUser(sb, uid);
  if (!riderGate.ok) return riderGate;
  const rr = riderGate.rider.id;
  if (riderGate.rider.suspended_at) return { ok: false, error: "rider_suspended", httpStatus: 409 };
  if (riderGate.rider.admin_status === "paused") return { ok: false, error: "rider_paused", httpStatus: 409 };

  const guard = await loadOrderGuard(sb, oid);
  if (!guard.ok) return guard;
  if (orderBlocksDelivery(guard.order_status)) {
    return { ok: false, error: "order_terminal_blocks_delivery", httpStatus: 409 };
  }

  const ensured = await ensureDeliveryRow(sb, {
    orderId: oid,
    storeId: guard.store_id,
    buyerUserId: guard.buyer_user_id,
  });
  if (!ensured.ok) return ensured;

  const assignedRider = safeTrim(ensured.row.rider_id);
  if (assignedRider !== rr) {
    return { ok: false, error: "rider_not_assigned_to_order", httpStatus: 403 };
  }

  const prev = ensured.row.delivery_status;
  const online = riderGate.rider.is_online === true;

  const allowsOfflineStep =
    opts.action.type === "customer_arrived" ||
    (opts.action.type === "set_delivery_status" &&
      opts.action.delivery_status === "delivered" &&
      prev === "delivering");

  if (!online && !allowsOfflineStep) {
    return { ok: false, error: "rider_offline", httpStatus: 409 };
  }

  let patch: Record<string, unknown> = {};

  if (opts.action.type === "accept") {
    if (prev !== "rider_assigned") {
      return { ok: false, error: "accept_only_rider_assigned", httpStatus: 409 };
    }
    if (ensured.row.rider_accepted_at) {
      return { ok: true, row: ensured.row, previous_status: prev };
    }
    patch = { rider_accepted_at: nowIso() };
  } else if (opts.action.type === "decline") {
    if (prev !== "rider_assigned") {
      return { ok: false, error: "decline_only_rider_assigned", httpStatus: 409 };
    }
    patch = {
      delivery_status: "waiting_rider",
      rider_id: null,
      assigned_at: null,
      rider_accepted_at: null,
      customer_arrived_at: null,
      rider_decline_reason: clampDeclineReason(opts.action.reason) ?? "rider_declined",
    };
  } else if (opts.action.type === "customer_arrived") {
    if (prev !== "delivering") {
      return { ok: false, error: "customer_arrived_only_delivering", httpStatus: 409 };
    }
    if (ensured.row.customer_arrived_at) {
      return { ok: true, row: ensured.row, previous_status: prev };
    }
    patch = { customer_arrived_at: nowIso() };
  } else if (opts.action.type === "report_delivery_failure") {
    if (prev !== "pickup_in_progress" && prev !== "delivering") {
      return { ok: false, error: "failure_report_bad_status", httpStatus: 409 };
    }
    if (ensured.row.rider_failure_reported_at) {
      return { ok: false, error: "failure_report_already_submitted", httpStatus: 409 };
    }
    const reason = clampReportReason(opts.action.reason);
    if (!reason) return { ok: false, error: "failure_report_reason_required", httpStatus: 400 };
    const pathImg = sanitizeDeliveryProofStoragePath(oid, opts.action.failure_proof_image_path);
    const legImg = sanitizeDeliveryProofImageUrl(opts.action.failure_proof_image_url);
    const lat = Number(opts.action.lat);
    const lng = Number(opts.action.lng);
    patch = {
      rider_failure_reported_at: nowIso(),
      rider_failure_report_reason: reason,
      failure_note: clampNote(opts.action.note),
      failure_proof_image_path: pathImg,
      failure_proof_image_url: pathImg ? null : legImg,
    };
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      patch.failure_report_lat = lat;
      patch.failure_report_lng = lng;
    } else if (
      riderGate.rider.current_lat != null &&
      riderGate.rider.current_lng != null &&
      Number.isFinite(Number(riderGate.rider.current_lat)) &&
      Number.isFinite(Number(riderGate.rider.current_lng))
    ) {
      patch.failure_report_lat = Number(riderGate.rider.current_lat);
      patch.failure_report_lng = Number(riderGate.rider.current_lng);
    }
  } else {
    const desiredRaw = safeTrim(opts.action.delivery_status);
    if (desiredRaw === "delivery_failed") {
      return { ok: false, error: "rider_cannot_set_delivery_failed", httpStatus: 403 };
    }
    if (!isValidDeliveryStatus(desiredRaw)) {
      return { ok: false, error: "invalid_delivery_status", httpStatus: 400 };
    }
    const allowed = allowedDeliveryTransitions(prev);
    if (!allowed.includes(desiredRaw)) {
      return { ok: false, error: "invalid_delivery_transition", httpStatus: 400 };
    }
    if (!orderAllowsDispatch(guard.order_status)) {
      return { ok: false, error: "order_status_blocks_dispatch", httpStatus: 409 };
    }
    if (desiredRaw === "pickup_in_progress" && prev === "rider_assigned") {
      if (!ensured.row.rider_accepted_at) {
        return { ok: false, error: "must_accept_before_depart", httpStatus: 409 };
      }
    }
    patch = { delivery_status: desiredRaw };
    if (desiredRaw === "pickup_in_progress" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
    if (desiredRaw === "delivering" && !ensured.row.picked_up_at) patch.picked_up_at = nowIso();
    if (desiredRaw === "delivered") {
      if (!ensured.row.delivered_at) patch.delivered_at = nowIso();
      patch.delivered_confirmed_at = nowIso();
      const pod = opts.action.pod;
      if (pod) {
        patch.delivered_proof_note = clampNote(pod.delivered_proof_note);
        patch.delivered_receiver_name = clampReceiverName(pod.delivered_receiver_name);
        const pathImg = sanitizeDeliveryProofStoragePath(oid, pod.delivered_proof_image_path);
        const legImg = sanitizeDeliveryProofImageUrl(pod.delivered_proof_image_url);
        if (pathImg) {
          patch.delivered_proof_image_path = pathImg;
          patch.delivered_proof_image_url = null;
        } else if (legImg) {
          patch.delivered_proof_image_url = legImg;
          patch.delivered_proof_image_path = null;
        }
        const plat = Number(pod.delivered_proof_lat);
        const plng = Number(pod.delivered_proof_lng);
        if (
          Number.isFinite(plat) &&
          Number.isFinite(plng) &&
          Math.abs(plat) <= 90 &&
          Math.abs(plng) <= 180
        ) {
          patch.delivered_proof_lat = plat;
          patch.delivered_proof_lng = plng;
        }
      }
      if (patch.delivered_proof_lat == null && riderGate.rider.current_lat != null && riderGate.rider.current_lng != null) {
        const plat = Number(riderGate.rider.current_lat);
        const plng = Number(riderGate.rider.current_lng);
        if (Number.isFinite(plat) && Number.isFinite(plng) && Math.abs(plat) <= 90 && Math.abs(plng) <= 180) {
          patch.delivered_proof_lat = plat;
          patch.delivered_proof_lng = plng;
        }
      }
    }
  }

  const { data: updated, error: uErr } = await sb
    .from("store_order_deliveries")
    .update(patch)
    .eq("order_id", oid)
    .eq("delivery_status", prev)
    .select(DELIVERY_ROW_SELECT)
    .maybeSingle();

  if (uErr) {
    const msg = String(uErr.message ?? "");
    if (RIDER_APP_DELIVERY_COL_KEYS.test(msg) && /does not exist/i.test(msg)) {
      return { ok: false, error: "rider_delivery_columns_missing_apply_migration", httpStatus: 503 };
    }
    return { ok: false, error: msg.slice(0, 240), httpStatus: 500 };
  }
  if (!updated) {
    return { ok: false, error: "delivery_status_stale_retry", httpStatus: 409 };
  }

  if (opts.action.type === "decline" || opts.action.type === "report_delivery_failure") {
    const { error: oErr } = await sb.from("store_orders").update({ needs_admin_attention: true }).eq("id", oid);
    if (oErr) {
      return { ok: false, error: oErr.message ?? "order_flag_failed", httpStatus: 500 };
    }
  }

  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: uid,
    target_type: "store_order",
    target_id: oid,
    action: "store_order.delivery.rider_patch",
    before_json: { delivery_status: prev, action: redactRiderDeliveryActionForAudit(opts.action) },
    after_json: redactDeliveryProofAuditPatch(patch),
    ip: opts.ip ?? null,
    user_agent: opts.user_agent ?? null,
  });

  return { ok: true, row: updated as unknown as StoreOrderDeliveryRow, previous_status: prev };
}

