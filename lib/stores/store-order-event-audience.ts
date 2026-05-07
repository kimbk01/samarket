import type { StoreOrderEventRow } from "@/lib/stores/store-order-events";

const OWNER_ONLY_EVENT_TYPES = new Set<string>(["order_payment_completed_owner"]);

function metaRecord(meta: unknown): Record<string, unknown> | null {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

/** 구매자 주문 상세(/my)·GET …/events 구매자 분기 — 매장 전용 원장 숨김 */
export function isStoreOrderEventVisibleToBuyer(row: Pick<StoreOrderEventRow, "event_type" | "metadata">): boolean {
  const m = metaRecord(row.metadata);
  const explicit = typeof m?.audience === "string" ? m.audience.trim().toLowerCase() : "";
  if (explicit === "owner" || explicit === "admin") {
    return false;
  }
  /** 라이더·내부 배차만 보는 이벤트(추후 metadata.audience 로 표시) */
  if (explicit === "rider" && m?.rider_internal === true) {
    return false;
  }
  if (OWNER_ONLY_EVENT_TYPES.has(row.event_type)) {
    return false;
  }
  return true;
}
