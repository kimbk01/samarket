/** DB `store_orders_order_status_check` 및 운영 문서와 동일 순서·집합 유지 */
export const STORE_ORDER_STATUS_LIST = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
] as const;

export type StoreOrderStatus = (typeof STORE_ORDER_STATUS_LIST)[number];

/** Phase 6A — order_status writer actor (PAYMENT is outside this machine) */
export type StoreOrderStatusActor = "CUSTOMER" | "OWNER" | "ADMIN" | "SYSTEM";

/** SYSTEM: cron auto-complete · external-delivery · payment_failure recovery */
export type StoreOrderSystemPurpose = "auto_complete" | "external_delivery" | "payment_failure";

const VALID = new Set<string>(STORE_ORDER_STATUS_LIST);

/** Owner mid-flow cancel request (→ cancel_requested) */
export const OWNER_CANCEL_REQUEST_FROM = new Set([
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
]);

/** Admin reject cancel_requested may only restore to these */
export const ADMIN_CANCEL_REQUEST_RESTORE_STATUSES = new Set([
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
]);

/** 동네배달·택배 — 픽업과 다른 전이(배송중 이후) */
export function isDeliveryFulfillment(fulfillment: string): boolean {
  return fulfillment === "local_delivery" || fulfillment === "shipping";
}

export function isValidOrderStatus(s: string): boolean {
  return VALID.has(s);
}

/**
 * 오너가 설정할 수 있는 다음 상태 (fulfillment에 따라 분기)
 * 배달: preparing→ready_for_pickup(픽업준비)→delivering→arrived→completed
 * 픽업: preparing→ready_for_pickup→completed
 */
export function allowedOrderTransitions(current: string, fulfillment: string): string[] {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  switch (current) {
    case "pending":
      return ["accepted", "cancelled"];
    case "accepted":
      return ["preparing", "cancelled"];
    case "preparing":
      return ["ready_for_pickup"];
    case "ready_for_pickup":
      if (deliveryLike) return ["delivering"];
      return ["completed"];
    case "delivering":
      /** 오너 운영 CTA: 배달완료를 우선. 서버 채팅은 완료 시 주소근처도착 라인을 보강한다. */
      return ["completed", "arrived"];
    case "arrived":
      return ["completed"];
    default:
      return [];
  }
}

export type AllowedTransitionsForActorOpts = {
  paymentStatus?: string;
  /** ADMIN: cancel_requested → previous */
  restoreToStatus?: string | null;
  /** SYSTEM auto_complete: auto_complete_at <= now */
  autoCompleteDue?: boolean;
  systemPurpose?: StoreOrderSystemPurpose;
};

/**
 * Actor-scoped order_status edges (Phase 6A).
 * OWNER graph remains `allowedOrderTransitions` + cancel_requested from mid-flow.
 * SYSTEM delivering→completed removed (legacy cron only; not in OWNER apply auto_complete setters).
 */
export function allowedOrderTransitionsForActor(
  actor: StoreOrderStatusActor,
  current: string,
  fulfillment: string,
  opts?: AllowedTransitionsForActorOpts
): string[] {
  switch (actor) {
    case "OWNER": {
      const base = allowedOrderTransitions(current, fulfillment);
      if (OWNER_CANCEL_REQUEST_FROM.has(current) && !base.includes("cancel_requested")) {
        return [...base, "cancel_requested"];
      }
      return base;
    }
    case "CUSTOMER": {
      if (current === "pending") return ["cancelled"];
      if (canBuyerRequestStoreRefund(current, opts?.paymentStatus ?? "paid")) {
        return ["refund_requested"];
      }
      return [];
    }
    case "ADMIN": {
      if (current === "refund_requested") return ["refunded"];
      if (current === "cancel_requested") {
        const out = ["cancelled"];
        const restore = String(opts?.restoreToStatus ?? "").trim();
        if (restore && ADMIN_CANCEL_REQUEST_RESTORE_STATUSES.has(restore)) {
          out.push(restore);
        }
        return out;
      }
      if (current === "completed" || current === "refunded" || current === "cancelled") {
        return [];
      }
      const out: string[] = ["cancelled"];
      if (canBuyerRequestStoreRefund(current, opts?.paymentStatus ?? "paid")) {
        out.push("refund_requested");
      }
      return out;
    }
    case "SYSTEM": {
      if (opts?.systemPurpose === "payment_failure") {
        // Recovery Chain: unpaid pending order → cancel (+ stock restore in apply)
        return current === "pending" ? ["cancelled"] : [];
      }
      if (opts?.systemPurpose === "external_delivery") {
        return allowedOrderTransitions(current, fulfillment);
      }
      if (!opts?.autoCompleteDue) return [];
      if (current === "ready_for_pickup" && !isDeliveryFulfillment(fulfillment)) {
        return ["completed"];
      }
      if (current === "arrived" && isDeliveryFulfillment(fulfillment)) {
        return ["completed"];
      }
      return [];
    }
    default:
      return [];
  }
}

/**
 * Cancel terminal → restore stock when inventory was reserved at create.
 * Includes `cancel_requested` so Admin approve (cancel_requested→cancelled) uses the same Recovery Chain.
 */
export function shouldRestoreStockOnCancel(prevStatus: string): boolean {
  return [
    "pending",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "delivering",
    "arrived",
    "cancel_requested",
  ].includes(prevStatus);
}

/** 레거시: 시스템 결제 게이트 없음 — 항상 허용 목록 그대로 반환 */
export function filterTransitionsByPayment(
  allowed: string[],
  _current: string,
  _paymentStatus: string
): string[] {
  return allowed;
}

/** 결제 완료 후·완료 전 구매자 환불 요청 가능한 주문 진행 상태 */
const BUYER_REFUND_REQUEST_STATUSES = new Set([
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
]);

export function canBuyerRequestStoreRefund(orderStatus: string, paymentStatus: string): boolean {
  if (!BUYER_REFUND_REQUEST_STATUSES.has(orderStatus)) return false;
  return paymentStatus !== "cancelled" && paymentStatus !== "refunded";
}

/** 주문 취소 완료 후 구매자 주문 채팅 진입 비활성화 */
export function isStoreOrderChatDisabledForBuyer(orderStatus: string): boolean {
  return orderStatus === "cancelled";
}
