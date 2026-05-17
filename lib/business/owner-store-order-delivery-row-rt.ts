import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";

export type OwnerStoreOrderDeliverySnapshot = NonNullable<OwnerStoreOrderListRow["delivery"]>;

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Supabase `store_order_deliveries` realtime payload → 목록 행 `delivery` 스냅샷 */
export function mapRealtimeRecordToOrderDelivery(
  record: Record<string, unknown>
): OwnerStoreOrderDeliverySnapshot | null {
  const orderId = strOrNull(record.order_id);
  if (!orderId) return null;
  return {
    order_id: orderId,
    rider_id: strOrNull(record.rider_id),
    delivery_status: String(record.delivery_status ?? "").trim() || "waiting_rider",
    assigned_at: strOrNull(record.assigned_at),
    picked_up_at: strOrNull(record.picked_up_at),
    delivered_at: strOrNull(record.delivered_at),
    rider_accepted_at: strOrNull(record.rider_accepted_at),
    customer_arrived_at: strOrNull(record.customer_arrived_at),
    rider_failure_reported_at: strOrNull(record.rider_failure_reported_at),
    rider_failure_report_reason: strOrNull(record.rider_failure_report_reason),
    updated_at: strOrNull(record.updated_at),
    admin_note: strOrNull(record.admin_note),
  };
}

/** UPDATE — 기존 delivery에 realtime 필드만 합침 */
export function mergeRealtimeRecordIntoOrderDelivery(
  prev: OwnerStoreOrderDeliverySnapshot | null | undefined,
  record: Record<string, unknown>
): OwnerStoreOrderDeliverySnapshot | null {
  const mapped = mapRealtimeRecordToOrderDelivery(record);
  if (!mapped) return prev ?? null;
  if (!prev) return mapped;
  return {
    ...prev,
    ...mapped,
    order_id: prev.order_id,
  };
}

export function deliveryStatusOf(
  d: OwnerStoreOrderDeliverySnapshot | null | undefined
): string | undefined {
  const s = typeof d?.delivery_status === "string" ? d.delivery_status.trim() : "";
  return s || undefined;
}
