/**
 * DLV-02 ② — delivery row reached `delivered` → order `delivering` → `arrived` (SYSTEM `delivery_sync`).
 * `arrived` starts the existing auto-complete timer (apply) → auto-complete cron → `completed`.
 * Never jumps to `completed` (the buyer confirms / auto-confirm decides). Orders without a delivery row
 * (store self-delivery via owner status buttons) never reach here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyStoreOrderStatusTransition, type ApplyOrderStatusResult } from "@/lib/stores/apply-store-order-status-transition";

export async function syncOrderArrivedFromDeliveredRow(
  sb: SupabaseClient,
  input: { orderId: string; source: string }
): Promise<ApplyOrderStatusResult | null> {
  const oid = input.orderId.trim();
  if (!oid) return null;
  const { data: order } = await sb.from("store_orders").select("order_status").eq("id", oid).maybeSingle();
  const status = String((order as { order_status?: unknown } | null)?.order_status ?? "");
  if (status !== "delivering") return null;
  const r = await applyStoreOrderStatusTransition(sb, {
    orderId: oid,
    nextStatus: "arrived",
    actor: "SYSTEM",
    systemPurpose: "delivery_sync",
    expectedCurrentStatus: "delivering",
    eventMetadata: { source: input.source },
    audit: { actor_type: "system", actor_id: null, action: "store_order.delivery_sync_arrived" },
  });
  if (!r.ok && r.error !== "transition_conflict") {
    console.error("[delivery_sync] order arrived", oid, r.error);
  }
  return r;
}
