/**
 * SR-1 P2 W1 — reconcile missing commerce notification intents from store_order_events.
 * Reuses existing notify helpers (dedupe-safe). Does not invent new notification types.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notifyBuyerStoreOrderOwnerStatus,
  notifyBuyerStorePaymentCompleted,
  notifyBuyerStorePaymentFailed,
  notifyBuyerStoreRefundApproved,
  notifyBuyerStoreRefundRejected,
  notifyStoreOwnerBuyerCancelled,
  notifyStoreOwnerNewOrder,
  notifyStoreOwnerPaymentCompleted,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";

const OWNER_STATUS = new Set([
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancelled",
]);

/**
 * 23505 반복 차단 (docs/audit/commerce-reconcile-23505-fix-design-2026-10-29.md):
 * 아래 분기가 부르는 알림 함수의 `meta.kind` — `notify-store-commerce.ts` 와 같은 값(계약 테스트로 고정).
 * 이미 (이벤트 id, kind) 알림이 있으면 INSERT 를 다시 시도하지 않는다.
 */
export const RECONCILE_NOTIFICATION_KIND = {
  newOrder: "store_order_created",
  ownerPaymentCompleted: "store_order_payment_completed",
  buyerPaymentCompleted: "store_order_payment_completed_buyer",
  buyerPaymentFailed: "store_order_payment_failed",
  ownerRefundRequested: "store_order_refund_requested",
  buyerRefundApproved: "store_order_refund_approved",
  buyerRefundRejected: "store_order_refund_rejected",
  ownerBuyerCancelled: "store_order_buyer_cancelled",
  buyerOwnerStatus: "store_order_owner_status",
} as const;

/** 루프 분기 순서 그대로 — 이 이벤트가 만들 알림의 kind (해당 없음이면 null) */
function expectedReconcileKind(eventType: string, toStatus: string, actorRole: string): string | null {
  const K = RECONCILE_NOTIFICATION_KIND;
  if (eventType === "order_created") return K.newOrder;
  if (eventType === "order_payment_completed_owner") return K.ownerPaymentCompleted;
  if (eventType === "order_payment_completed_buyer") return K.buyerPaymentCompleted;
  if (eventType === "order_payment_failed_buyer") return K.buyerPaymentFailed;
  if (eventType === "refund_requested") return K.ownerRefundRequested;
  if (eventType === "refund_approved") return K.buyerRefundApproved;
  if (eventType === "refund_rejected") return K.buyerRefundRejected;
  if (eventType === "order_cancelled" && actorRole === "buyer") return K.ownerBuyerCancelled;
  if (OWNER_STATUS.has(toStatus)) return K.buyerOwnerStatus;
  return null;
}

/**
 * 이미 만들어진 (store_order_event_id, kind) 쌍 — 한 번의 조회.
 * 조회 실패 시 빈 집합(전부 기존처럼 호출 · fail-open).
 */
async function loadExistingReconcileKeys(
  sb: SupabaseClient,
  eventIds: string[],
  since: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (eventIds.length === 0) return keys;
  try {
    const { data, error } = await sb
      .from("notification_events")
      .select("event_id:display_payload->legacyMeta->>store_order_event_id, kind:display_payload->legacyMeta->>kind")
      .gte("created_at", since)
      .in("display_payload->legacyMeta->>store_order_event_id", eventIds);
    if (error || !Array.isArray(data)) return keys;
    for (const row of data as { event_id?: string | null; kind?: string | null }[]) {
      const eid = String(row.event_id ?? "").trim();
      const kind = String(row.kind ?? "").trim();
      if (eid && kind) keys.add(`${eid}|${kind}`);
    }
  } catch {
    return new Set<string>();
  }
  return keys;
}

type OrderEventRow = {
  id: string;
  order_id: string;
  store_id: string;
  event_type: string;
  to_status: string | null;
  actor_role: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

async function loadOrderBasics(
  sb: SupabaseClient,
  orderId: string
): Promise<{ orderNo: string; buyerUserId: string; paymentAmount: number } | null> {
  const { data, error } = await sb
    .from("store_orders")
    .select("order_no, buyer_user_id, payment_amount, total_amount")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  const buyerUserId = String((data as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
  const orderNo = String((data as { order_no?: string }).order_no ?? "").trim();
  const paymentAmount = Math.trunc(
    Number(
      (data as { payment_amount?: number; total_amount?: number }).payment_amount ??
        (data as { total_amount?: number }).total_amount ??
        0
    ) || 0
  );
  return { orderNo, buyerUserId, paymentAmount };
}

/** 정상 경로(`app/api/me/store-orders` 의 `lines.length`)와 같은 기준 — 주문 품목 행 수. */
async function loadOrderLineCount(sb: SupabaseClient, orderId: string): Promise<number> {
  const { count, error } = await sb
    .from("store_order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function reconcileCommerceNotificationIntentsFromStoreOrderEvents(
  sb: SupabaseClient,
  opts?: { lookbackMinutes?: number; limit?: number }
): Promise<{ scanned: number; reconciled: number; skippedExisting: number }> {
  const lookbackMinutes = Math.max(5, Math.min(24 * 60, Math.floor(opts?.lookbackMinutes ?? 180)));
  const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? 50)));
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();

  const { data, error } = await sb
    .from("store_order_events")
    .select("id, order_id, store_id, event_type, to_status, actor_role, message, metadata, created_at")
    .gte("created_at", since)
    .in("event_type", [
      "order_created",
      "order_payment_completed_owner",
      "order_payment_completed_buyer",
      "order_payment_failed_buyer",
      "order_accepted",
      "order_preparing",
      "order_ready",
      "order_delivering",
      "order_completed",
      "order_cancelled",
      "refund_requested",
      "refund_approved",
      "refund_rejected",
    ])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[reconcileCommerceNotificationIntents]", error.message);
    return { scanned: 0, reconciled: 0, skippedExisting: 0 };
  }

  const rows = (data ?? []) as OrderEventRow[];
  let reconciled = 0;
  let skippedExisting = 0;
  const existing = await loadExistingReconcileKeys(
    sb,
    rows.map((r) => String(r.id ?? "").trim()).filter(Boolean),
    since
  );

  for (const ev of rows) {
    const orderId = String(ev.order_id ?? "").trim();
    const storeId = String(ev.store_id ?? "").trim();
    if (!orderId || !storeId) continue;
    const eventId = String(ev.id).trim();
    const eventType = String(ev.event_type).trim();
    const toStatus = String(ev.to_status ?? "").trim();
    const expectedKind = expectedReconcileKind(eventType, toStatus, String(ev.actor_role ?? ""));
    if (expectedKind && existing.has(`${eventId}|${expectedKind}`)) {
      skippedExisting += 1;
      continue;
    }
    const basics = await loadOrderBasics(sb, orderId);
    if (!basics) continue;

    try {
      if (eventType === "order_created") {
        await notifyStoreOwnerNewOrder(sb, {
          storeId,
          orderId,
          orderNo: basics.orderNo,
          paymentAmount: basics.paymentAmount,
          // T5 (docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md C): 0 고정 → 「0개 품목」 오표시
          lineCount: await loadOrderLineCount(sb, orderId),
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "order_payment_completed_owner") {
        await notifyStoreOwnerPaymentCompleted(sb, {
          storeId,
          orderId,
          orderNo: basics.orderNo,
          paymentAmount: basics.paymentAmount,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "order_payment_completed_buyer" && basics.buyerUserId) {
        await notifyBuyerStorePaymentCompleted(sb, {
          buyerUserId: basics.buyerUserId,
          orderId,
          orderNo: basics.orderNo,
          storeId,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "order_payment_failed_buyer" && basics.buyerUserId) {
        await notifyBuyerStorePaymentFailed(sb, {
          buyerUserId: basics.buyerUserId,
          orderId,
          orderNo: basics.orderNo,
          storeId,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "refund_requested") {
        await notifyStoreOwnerRefundRequested(sb, {
          storeId,
          orderId,
          orderNo: basics.orderNo,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "refund_approved" && basics.buyerUserId) {
        await notifyBuyerStoreRefundApproved(sb, {
          buyerUserId: basics.buyerUserId,
          orderId,
          orderNo: basics.orderNo,
          storeId,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "refund_rejected" && basics.buyerUserId) {
        await notifyBuyerStoreRefundRejected(sb, {
          buyerUserId: basics.buyerUserId,
          orderId,
          orderNo: basics.orderNo,
          storeId,
          reason: String(ev.message ?? ""),
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (eventType === "order_cancelled" && String(ev.actor_role ?? "") === "buyer") {
        await notifyStoreOwnerBuyerCancelled(sb, {
          storeId,
          orderId,
          orderNo: basics.orderNo,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
        continue;
      }
      if (OWNER_STATUS.has(toStatus) && basics.buyerUserId) {
        await notifyBuyerStoreOrderOwnerStatus(sb, {
          buyerUserId: basics.buyerUserId,
          orderId,
          orderNo: basics.orderNo,
          storeId,
          nextStatus: toStatus,
          storeOrderEventId: eventId,
        });
        reconciled += 1;
      }
    } catch (err) {
      console.error("[reconcileCommerceNotificationIntents] event failed", {
        eventId,
        eventType,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  return { scanned: rows.length, reconciled, skippedExisting };
}
