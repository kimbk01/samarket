import type { SupabaseClient } from "@supabase/supabase-js";
import { writeThroughStoreOrderEventsReadCache } from "@/lib/stores/store-order-events-read-cache";

export type StoreOrderActorRole = "buyer" | "owner" | "rider" | "admin" | "system";

export type StoreOrderEventType =
  | "order_created"
  | "order_accepted"
  | "order_rejected"
  | "order_preparing"
  | "order_ready"
  | "order_delivering"
  | "order_completed"
  | "order_cancelled"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "system_note"
  | "delivery_status_changed"
  | "order_payment_completed_buyer"
  | "order_payment_completed_owner"
  | "order_payment_failed_buyer";

export type StoreOrderEventRow = {
  id: string;
  order_id: string;
  store_id: string;
  actor_user_id: string | null;
  actor_role: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateStoreOrderEventInput = {
  orderId: string;
  storeId: string;
  actorUserId?: string | null;
  actorRole: StoreOrderActorRole;
  eventType: StoreOrderEventType | string;
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string | null;
  dedupeKey?: string | null;
  /** 선택 — 조회 시 audience 필터용(예 `{ audience: "owner" }`). */
  metadata?: Record<string, unknown>;
};

/**
 * dedupe_key 규칙:
 * - order_created → `{orderId}:order_created`
 * - 그 외 → `{orderId}:{eventType}:{toStatus}:${actorUserId ?? ''}`
 */
export function buildStoreOrderEventDedupeKey(input: {
  orderId: string;
  eventType: string;
  toStatus?: string | null;
  actorUserId?: string | null;
}): string {
  const oid = input.orderId.trim();
  const et = input.eventType.trim();
  if (et === "order_created") return `${oid}:order_created`;
  const ts = (input.toStatus ?? "").trim();
  const au = (input.actorUserId ?? "").trim();
  return `${oid}:${et}:${ts}:${au}`;
}

/** 결제 알림·원장 정렬용 (payment_status 전이 1회) */
export function buildStoreOrderPaymentEventDedupeKey(
  orderId: string,
  kind: "buyer_paid" | "owner_paid" | "buyer_failed"
): string {
  const oid = orderId.trim();
  switch (kind) {
    case "buyer_paid":
      return `${oid}:order_payment_completed_buyer`;
    case "owner_paid":
      return `${oid}:order_payment_completed_owner`;
    case "buyer_failed":
      return `${oid}:order_payment_failed_buyer`;
    default:
      return `${oid}:order_payment`;
  }
}

/** 크론 자동 구매확정 — 수동 완료와 구분하는 전용 dedupe */
export function buildStoreOrderAutoCompleteDedupeKey(orderId: string): string {
  return `${orderId.trim()}:order_auto_completed`;
}

/** 전이 후 상태 → 이벤트 타입 (타임라인·알림 단위) */
export function mapOrderStatusToEventType(status: string): StoreOrderEventType {
  const s = status.trim();
  switch (s) {
    case "accepted":
      return "order_accepted";
    case "preparing":
      return "order_preparing";
    case "ready_for_pickup":
      return "order_ready";
    case "delivering":
    case "arrived":
      return "order_delivering";
    case "completed":
      return "order_completed";
    case "cancelled":
    case "cancel_requested":
      return "order_cancelled";
    case "refund_requested":
      return "refund_requested";
    case "refunded":
      return "refund_approved";
    default:
      return "system_note";
  }
}

function inferActorRoleFromAudit(actorType: "user" | "system"): StoreOrderActorRole {
  return actorType === "system" ? "system" : "owner";
}

export type CreateStoreOrderStatusEventInput = {
  orderId: string;
  storeId: string;
  fromStatus: string;
  toStatus: string;
  audit: { actor_type: "user" | "system"; actor_id: string | null };
  /** 미지정 시 user→owner, system→system */
  actorRole?: StoreOrderActorRole;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * 상태 전이 1건당 이벤트 1건 (dedupe 로 동일 전이 재시도 시 기존 행 반환).
 */
export async function createStoreOrderStatusEvent(
  sb: SupabaseClient,
  input: CreateStoreOrderStatusEventInput
): Promise<{ ok: true; row: StoreOrderEventRow; inserted: boolean } | { ok: false; error: string }> {
  const actorRole = input.actorRole ?? inferActorRoleFromAudit(input.audit.actor_type);
  const actorUserId =
    input.audit.actor_type === "user" && input.audit.actor_id?.trim()
      ? input.audit.actor_id.trim()
      : null;
  const eventType = mapOrderStatusToEventType(input.toStatus);
  const dedupeKey = buildStoreOrderEventDedupeKey({
    orderId: input.orderId,
    eventType,
    toStatus: input.toStatus,
    actorUserId,
  });
  return createStoreOrderEvent(sb, {
    orderId: input.orderId,
    storeId: input.storeId,
    actorUserId,
    actorRole,
    eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    message: input.message ?? null,
    dedupeKey,
    metadata: {
      ...(input.metadata ?? {}),
      source: "store_order_status_transition",
    },
  });
}

/**
 * append-only insert — 동일 dedupe_key 가 이미 있으면 기존 행 반환(inserted: false).
 */
export async function createStoreOrderEvent(
  sb: SupabaseClient,
  input: CreateStoreOrderEventInput
): Promise<{ ok: true; row: StoreOrderEventRow; inserted: boolean } | { ok: false; error: string }> {
  const orderId = input.orderId.trim();
  const storeId = input.storeId.trim();
  if (!orderId || !storeId) return { ok: false, error: "missing_ids" };

  const dedupeKey =
    input.dedupeKey?.trim() ||
    buildStoreOrderEventDedupeKey({
      orderId,
      eventType: String(input.eventType),
      toStatus: input.toStatus,
      actorUserId: input.actorUserId,
    });

  if (dedupeKey) {
    const { data: existing, error: selErr } = await sb
      .from("store_order_events")
      .select("*")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (!selErr && existing?.id) {
      return { ok: true, row: existing as StoreOrderEventRow, inserted: false };
    }
  }

  const insertRow: Record<string, unknown> = {
    order_id: orderId,
    store_id: storeId,
    actor_user_id: input.actorUserId?.trim() || null,
    actor_role: input.actorRole,
    event_type: String(input.eventType),
    from_status: input.fromStatus?.trim() || null,
    to_status: input.toStatus?.trim() || null,
    message: input.message?.trim() || null,
    dedupe_key: dedupeKey || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  const { data, error } = await sb.from("store_order_events").insert(insertRow).select("*").maybeSingle();

  if (!error && data?.id) {
    writeThroughStoreOrderEventsReadCache(orderId, data as StoreOrderEventRow);
    return { ok: true, row: data as StoreOrderEventRow, inserted: true };
  }

  const code = (error as { code?: string } | null)?.code;
  if (code === "23505" && dedupeKey) {
    const { data: again } = await sb
      .from("store_order_events")
      .select("*")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (again?.id) return { ok: true, row: again as StoreOrderEventRow, inserted: false };
  }

  const msg = error?.message ?? "store_order_events_insert_failed";
  if (/does not exist|Could not find the table/i.test(msg)) {
    return { ok: false, error: msg };
  }
  console.error("[store_order_events] insert", error);
  return { ok: false, error: msg };
}

/** 배달 세부 단계(주문 order_status 외 별도 머신) — 라이더·관리자·오너 배달 패치에서 공통 사용 */
export type StoreOrderDeliveryMilestone =
  | "rider_assigned"
  | "rider_accepted"
  | "rider_pickup"
  | "rider_near_customer"
  | "rider_delivered"
  | "rider_declined"
  | "customer_arrived"
  | "failure_report"
  | "delivery_status";

export function buildStoreOrderDeliveryDedupeKey(input: {
  orderId: string;
  milestone: StoreOrderDeliveryMilestone;
  actorUserId: string | null;
  toDeliveryStatus?: string | null;
}): string {
  const oid = input.orderId.trim();
  const au = (input.actorUserId ?? "").trim();
  const td = (input.toDeliveryStatus ?? "").trim();
  switch (input.milestone) {
    case "rider_assigned":
      return `${oid}:delivery:rider_assigned:${td}:${au}`;
    case "rider_accepted":
      return `${oid}:delivery:rider_accepted:${au}`;
    case "rider_pickup":
      return `${oid}:delivery:rider_pickup:${td}:${au}`;
    case "rider_near_customer":
      return `${oid}:delivery:rider_near_customer:${td}:${au}`;
    case "rider_delivered":
      return `${oid}:delivery:rider_delivered:${td}:${au}`;
    case "customer_arrived":
      return `${oid}:delivery:customer_arrived:${au}`;
    case "failure_report":
      return `${oid}:delivery:failure_report:${au}`;
    case "rider_declined":
      return `${oid}:delivery:rider_declined:${td}:${au}`;
    case "delivery_status":
      return `${oid}:delivery:status:${td}:${au}`;
    default:
      return `${oid}:delivery:${input.milestone}:${au}`;
  }
}

export async function createStoreOrderDeliveryLifecycleEvent(
  sb: SupabaseClient,
  input: {
    orderId: string;
    storeId: string;
    actorRole: StoreOrderActorRole;
    actorUserId: string | null;
    milestone: StoreOrderDeliveryMilestone;
    fromDeliveryStatus: string;
    toDeliveryStatus?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<{ ok: true; row: StoreOrderEventRow; inserted: boolean } | { ok: false; error: string }> {
  const fromDs = input.fromDeliveryStatus.trim();
  const toDs = (input.toDeliveryStatus ?? "").trim();
  const dedupeKey = buildStoreOrderDeliveryDedupeKey({
    orderId: input.orderId,
    milestone: input.milestone,
    actorUserId: input.actorUserId,
    toDeliveryStatus: input.milestone === "rider_declined" || input.milestone === "delivery_status" ? toDs || fromDs : toDs || null,
  });

  const fromStatusCol =
    input.milestone === "rider_declined" ||
    input.milestone === "delivery_status" ||
    input.milestone === "rider_assigned" ||
    input.milestone === "rider_pickup" ||
    input.milestone === "rider_near_customer" ||
    input.milestone === "rider_delivered"
      ? (fromDs || null)
      : null;
  const toStatusCol =
    input.milestone === "rider_declined" ||
    input.milestone === "delivery_status" ||
    input.milestone === "rider_assigned" ||
    input.milestone === "rider_pickup" ||
    input.milestone === "rider_near_customer" ||
    input.milestone === "rider_delivered"
      ? (toDs || null)
      : null;

  return createStoreOrderEvent(sb, {
    orderId: input.orderId,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    eventType: "delivery_status_changed",
    fromStatus: fromStatusCol,
    toStatus: toStatusCol,
    dedupeKey,
    metadata: {
      delivery_milestone: input.milestone,
      delivery_from: fromDs,
      ...(toDs ? { delivery_to: toDs } : {}),
      ...(input.metadata ?? {}),
    },
  });
}
