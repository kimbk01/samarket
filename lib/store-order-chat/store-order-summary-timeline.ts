import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import {
  isStoreOrderTerminalStatus,
  processFlowStepStates,
  processStatusLabel,
  processStepLabel,
  processSteps,
  type StoreOrderProcessStepKey,
} from "@/lib/stores/store-order-process-model";

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
  const lang = getRuntimeAppLanguage();
  const orderStatus = input.orderStatus.trim();
  const atByStatus = new Map<string, string>();

  if (input.orderCreatedAt?.trim()) {
    const createdAt = input.orderCreatedAt.trim();
    atByStatus.set("pending", createdAt);
    if (!atByStatus.has("accepted")) atByStatus.set("accepted", createdAt);
  }

  for (const ev of input.statusEvents ?? []) {
    const to = typeof ev.to_status === "string" ? ev.to_status.trim() : "";
    const at = typeof ev.created_at === "string" ? ev.created_at.trim() : "";
    if (to && at) atByStatus.set(to, at);
  }

  if (!atByStatus.has("preparing") && atByStatus.has("ready_for_pickup")) {
    atByStatus.set("preparing", atByStatus.get("ready_for_pickup")!);
  }
  if (!atByStatus.has("delivering") && atByStatus.has("arrived")) {
    atByStatus.set("delivering", atByStatus.get("arrived")!);
  }

  if (isStoreOrderTerminalStatus(orderStatus)) {
    return [
      {
        key: orderStatus,
        label: processStatusLabel(orderStatus, input.fulfillmentType, "buyer", lang),
        at: atByStatus.get(orderStatus) ?? input.orderCreatedAt?.trim() ?? null,
        state: "current",
      },
    ];
  }

  const keys = processSteps(input.fulfillmentType);
  const states = processFlowStepStates(input.fulfillmentType, orderStatus);

  return keys.map((key, i) => {
    const uiState = states[i] ?? "upcoming";
    const state: StoreOrderSummaryTimelineStep["state"] = uiState;
    return {
      key,
      label: processStepLabel(key as StoreOrderProcessStepKey, input.fulfillmentType, "buyer", lang),
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

export function orderStatusLabelForSummary(dbStatus: string, fulfillmentType: string = "local_delivery"): string {
  const s = dbStatus.trim();
  return buyerOrderStatusLabel(s, getRuntimeAppLanguage(), fulfillmentType);
}
