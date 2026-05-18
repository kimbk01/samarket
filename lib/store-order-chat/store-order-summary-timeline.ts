import {
  BUYER_ORDER_STATUS_LABEL,
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
  buyerDetailSixStepStates,
} from "@/lib/stores/store-order-process-criteria";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

export type StoreOrderSummaryTimelineStep = {
  key: string;
  label: string;
  at: string | null;
  state: "done" | "current" | "upcoming" | "na";
};

type StatusEventRow = {
  to_status?: string | null;
  created_at?: string | null;
};

/** 주문 접수 시각 + 상태 이벤트로 채팅 카드용 타임라인 스텝 생성 */
export function buildStoreOrderSummaryTimelineSteps(input: {
  fulfillmentType: string;
  orderStatus: string;
  orderCreatedAt?: string | null;
  statusEvents?: StatusEventRow[];
}): StoreOrderSummaryTimelineStep[] {
  const deliveryLike = isDeliveryFulfillment(input.fulfillmentType);
  const labels = deliveryLike ? [...TIMELINE_DELIVERY_STEPS] : [...TIMELINE_PICKUP_STEPS];
  const statusKeys = deliveryLike
    ? (["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"] as const)
    : (["pending", "accepted", "preparing", "ready_for_pickup"] as const);

  const states = buyerDetailSixStepStates(input.fulfillmentType, input.orderStatus);
  const atByStatus = new Map<string, string>();

  if (input.orderCreatedAt?.trim()) {
    atByStatus.set("pending", input.orderCreatedAt.trim());
  }

  for (const ev of input.statusEvents ?? []) {
    const to = typeof ev.to_status === "string" ? ev.to_status.trim() : "";
    const at = typeof ev.created_at === "string" ? ev.created_at.trim() : "";
    if (to && at) atByStatus.set(to, at);
  }

  return labels.map((label, i) => {
    const key = statusKeys[i] ?? `step_${i}`;
    const uiState = states[i] ?? "upcoming";
    const state: StoreOrderSummaryTimelineStep["state"] =
      uiState === "na" ? "na" : uiState === "done" ? "done" : uiState === "current" ? "current" : "upcoming";
    return {
      key,
      label,
      at: atByStatus.get(key) ?? null,
      state,
    };
  });
}

export function formatStoreOrderSummaryTimelineTime(iso: string | null): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function orderStatusLabelForSummary(dbStatus: string): string {
  const s = dbStatus.trim();
  return BUYER_ORDER_STATUS_LABEL[s] ?? s;
}
