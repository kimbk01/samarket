import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";

/**
 * 파트너 원문 상태 → 내부 `order_status` 후보.
 * 실제 DB 반영 전 `allowedOrderTransitions`로 한 번 더 걸러짐 (역주행·건너뛰기 방지).
 */
export type PartnerToInternalResult =
  | { kind: "map"; target: StoreOrderStatus }
  | { kind: "skip"; reason: "unknown_partner_status" | "pickup_fulfillment_no_delivery" };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * 범용(계약 전) 파트너 코드값 — 실제 연동 시 provider별 테이블을 추가하고 분기 확장.
 *
 * 배달 흐름 정렬:
 * - 배송 중 계열 → `delivering` (현재가 허용할 때만 적용됨)
 * - 도착 계열 → `arrived` (delivering에서) 또는 `completed`(arrived에서) 로 해석하는 분기는 아래에서 처리
 * - 종료·취소 → `cancelled`
 */
export function mapExternalDeliveryPartnerStatus(
  provider: string,
  partnerStatusRaw: string,
  currentInternal: StoreOrderStatus,
  fulfillmentType: string
): PartnerToInternalResult {
  const isDeliveryLike = fulfillmentType === "local_delivery" || fulfillmentType === "shipping";
  if (!isDeliveryLike) {
    return { kind: "skip", reason: "pickup_fulfillment_no_delivery" };
  }

  const p = provider.trim().toLowerCase() || "generic";
  const s = norm(partnerStatusRaw);

  if (p === "generic" || p === "stub") {
    return mapGenericStub(s, currentInternal);
  }

  // 향후: lalamove, grab 등 — 동일 시그니처로 테이블만 추가
  return mapGenericStub(s, currentInternal);
}

/** 계약 전 로컬 테스트·문서용 기본 매핑 */
function mapGenericStub(s: string, current: StoreOrderStatus): PartnerToInternalResult {
  const inTransit = new Set([
    "rider_assigned",
    "assigned",
    "picking_up",
    "pickup",
    "going_to_pickup",
    "in_transit",
    "on_the_way",
    "delivering",
  ]);
  const nearDrop = new Set(["near_dropoff", "at_dropoff", "near_destination", "arrived_at_dropoff"]);
  const done = new Set(["delivered", "completed", "proof_of_delivery", "pod"]);
  const cancelled = new Set(["cancelled", "canceled", "failed", "delivery_failed"]);

  if (cancelled.has(s)) return { kind: "map", target: "cancelled" };
  if (inTransit.has(s)) return { kind: "map", target: "delivering" };
  if (nearDrop.has(s)) return { kind: "map", target: "arrived" };

  if (done.has(s)) {
    if (current === "arrived") return { kind: "map", target: "completed" };
    if (current === "delivering") return { kind: "map", target: "arrived" };
    return { kind: "skip", reason: "unknown_partner_status" };
  }

  return { kind: "skip", reason: "unknown_partner_status" };
}
