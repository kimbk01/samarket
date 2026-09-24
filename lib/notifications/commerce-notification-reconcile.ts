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

export async function reconcileCommerceNotificationIntentsFromStoreOrderEvents(
  sb: SupabaseClient,
  opts?: { lookbackMinutes?: number; limit?: number }
): Promise<{ scanned: number; reconciled: number }> {
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
    return { scanned: 0, reconciled: 0 };
  }

  const rows = (data ?? []) as OrderEventRow[];
  let reconciled = 0;

  for (const ev of rows) {
    const orderId = String(ev.order_id ?? "").trim();
    const storeId = String(ev.store_id ?? "").trim();
    if (!orderId || !storeId) continue;
    const basics = await loadOrderBasics(sb, orderId);
    if (!basics) continue;
    const eventId = String(ev.id).trim();
    const eventType = String(ev.event_type).trim();
    const toStatus = String(ev.to_status ?? "").trim();

    try {
      if (eventType === "order_created") {
        await notifyStoreOwnerNewOrder(sb, {
          storeId,
          orderId,
          orderNo: basics.orderNo,
          paymentAmount: basics.paymentAmount,
          lineCount: 0,
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

  return { scanned: rows.length, reconciled };
}
