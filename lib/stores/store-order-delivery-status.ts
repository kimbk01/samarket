export const STORE_ORDER_DELIVERY_STATUS_LIST = [
  "waiting_rider",
  "rider_assigned",
  "pickup_in_progress",
  "delivering",
  "delivered",
  "delivery_failed",
] as const;

export type StoreOrderDeliveryStatus = (typeof STORE_ORDER_DELIVERY_STATUS_LIST)[number];

const VALID = new Set<string>(STORE_ORDER_DELIVERY_STATUS_LIST);

export function isValidDeliveryStatus(s: string): s is StoreOrderDeliveryStatus {
  return VALID.has(s);
}

/**
 * V1 전이: 배차는 점진 전이만 허용 (뒤로 가기는 관리자 재배차 같은 별도 액션으로 다룬다).
 */
export function allowedDeliveryTransitions(current: StoreOrderDeliveryStatus): StoreOrderDeliveryStatus[] {
  switch (current) {
    case "waiting_rider":
      return ["rider_assigned", "delivery_failed"];
    case "rider_assigned":
      return ["pickup_in_progress", "delivery_failed"];
    case "pickup_in_progress":
      return ["delivering", "delivery_failed"];
    case "delivering":
      return ["delivered", "delivery_failed"];
    case "delivered":
      return [];
    case "delivery_failed":
      return ["waiting_rider", "rider_assigned"];
  }
}

