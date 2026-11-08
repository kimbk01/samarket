import { translateBy } from "@/lib/i18n/translate-by";

/**
 * DLV-01 / D-6 — the live delivery model is store self-delivery. The rider stack (delivery_riders,
 * store_order_deliveries, rider API, POD) stays in code but is not operated while no rider is registered.
 * Admin rider screens show this state instead of presenting the menu as a running operation.
 */
export type DeliveryRiderOpsMode = "self_delivery_only" | "rider_ops";

export function deliveryRiderOpsMode(ridersTotal: number | null | undefined): DeliveryRiderOpsMode | null {
  if (ridersTotal == null || !Number.isFinite(Number(ridersTotal))) return null;
  return Number(ridersTotal) <= 0 ? "self_delivery_only" : "rider_ops";
}

export function deliveryRiderOpsModeNotice(mode: DeliveryRiderOpsMode | null, ko: boolean): string | null {
  if (mode !== "self_delivery_only") return null;
  return translateBy(ko ? "ko" : "en", "stores_rider_ops_self_delivery_notice");
}
