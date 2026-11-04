import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  isStoreOrderTerminalStatus,
  orderStatusName,
  processFlowStepStates,
  processSteps,
  type StoreOrderCancelKind,
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

/**
 * 채팅 요약 카드 4칸 (주문접수 · 조리중 · 배달중|픽업대기 · 배달완료|픽업완료) + 칸마다 실제 진입 시각.
 * 시각 = 그 단계 이벤트 시각만 (주문 들어온 시각을 「주문접수」 자리에 넣지 않는다 — 3회차 D-6).
 * 이름은 보는 사람 언어로 매번 다시 만든다 (서버에서 굳힌 글자 사용 금지 — 3회차 「Delivered」).
 */
export function buildStoreOrderSummaryTimelineSteps(input: {
  fulfillmentType: string;
  orderStatus: string;
  orderCreatedAt?: string | null;
  acceptedAt?: string | null;
  statusEvents?: StatusEventRow[];
  cancelKind?: StoreOrderCancelKind | null;
  lang?: AppLanguageCode;
}): StoreOrderSummaryTimelineStep[] {
  const lang = input.lang ?? getRuntimeAppLanguage();
  const orderStatus = input.orderStatus.trim();
  const atByStatus = new Map<string, string>();
  for (const ev of input.statusEvents ?? []) {
    const to = typeof ev.to_status === "string" ? ev.to_status.trim() : "";
    const at = typeof ev.created_at === "string" ? ev.created_at.trim() : "";
    if (to && at && !atByStatus.has(to)) atByStatus.set(to, at);
  }
  if (!atByStatus.has("accepted") && input.acceptedAt?.trim()) atByStatus.set("accepted", input.acceptedAt.trim());
  // 예전 배달 흐름(준비 완료·도착) 시각은 같은 칸으로 모은다
  if (!atByStatus.has("delivering") && atByStatus.has("arrived")) {
    atByStatus.set("delivering", atByStatus.get("arrived")!);
  }

  if (isStoreOrderTerminalStatus(orderStatus)) {
    return [
      {
        key: orderStatus,
        label: orderStatusName(orderStatus, input.fulfillmentType, lang, input.cancelKind),
        at: atByStatus.get(orderStatus) ?? null,
        state: "current",
      },
    ];
  }

  const keys = processSteps(input.fulfillmentType);
  const states = processFlowStepStates(input.fulfillmentType, orderStatus);
  return keys.map((key, i) => ({
    key,
    label: orderStatusName(key, input.fulfillmentType, lang),
    at: atByStatus.get(key) ?? null,
    state: states[i] ?? "upcoming",
  }));
}

/** 저장된 요약 timeline(예전 7칸 포함) → 4칸 다시 만들기 (이름·칸은 정본, 시각만 재사용) */
export function rebuildStoreOrderSummaryTimelineFromStored(input: {
  stored: StoreOrderSummaryTimelineStep[] | null | undefined;
  fulfillmentType: string;
  orderStatus: string;
  acceptedAt?: string | null;
  cancelKind?: StoreOrderCancelKind | null;
  lang?: AppLanguageCode;
}): StoreOrderSummaryTimelineStep[] {
  const events = (input.stored ?? [])
    .filter((st) => st.key !== "accepted" && typeof st.at === "string" && st.at.trim())
    .map((st) => ({ to_status: st.key, created_at: st.at }));
  return buildStoreOrderSummaryTimelineSteps({
    fulfillmentType: input.fulfillmentType,
    orderStatus: input.orderStatus,
    acceptedAt: input.acceptedAt,
    statusEvents: events,
    cancelKind: input.cancelKind,
    lang: input.lang,
  });
}

/** 칸 시각 — 필리핀 시간 `HH:mm` (기기 시간대 무관) */
export function formatStoreOrderSummaryTimelineTime(iso: string | null): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatManilaDateTime(iso).slice(11, 16);
}

export function orderStatusLabelForSummary(
  dbStatus: string,
  fulfillmentType: string = "local_delivery",
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const s = dbStatus.trim();
  return buyerOrderStatusLabel(s, lang, fulfillmentType);
}
