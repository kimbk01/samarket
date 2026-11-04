/**
 * 매장·구매자·채팅·알림·관리자 — 주문 단계·용어 단일 원천 (4단계 정본).
 * 정본: docs/audit/store-order-process-terms-unify-design-2026-11-04.md §3 (Owner 2026-11-04 「용어와 프로세스를 정확히 통일」)
 * 문구 키: `lib/i18n/catalog/store-order-stage-terms.ts`
 * DO NOT: 주문 상태 → 이름 표를 다른 파일에 따로 만들지 말 것 (계약 테스트가 막는다).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  allowedOrderTransitions,
  isDeliveryFulfillment,
  STORE_ORDER_STATUS_LIST,
} from "@/lib/stores/order-status-transitions";

/** 4칸 각 칸을 대표하는 DB 상태 (3칸 = 배달 delivering / 픽업 ready_for_pickup) */
export type StoreOrderProcessStepKey =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "delivering"
  | "arrived"
  | "completed";

export type StoreOrderProcessAudience = "owner" | "buyer" | "owner_badge";

export type StoreOrderFlowStepState = "done" | "current" | "upcoming";

/** 취소 구분 — `store_orders.cancel_kind` (DB 가 취소 이벤트로 채움) */
export type StoreOrderCancelKind = "rejected" | "store" | "buyer" | "system" | "admin";

export const STORE_ORDER_STAGE_COUNT = 4;

/** 터미널·이슈 상태 — 4칸 대신 1줄 표시 */
export const STORE_ORDER_TERMINAL_STATUSES = new Set([
  "cancelled",
  "cancel_requested",
  "refund_requested",
  "refunded",
]);

export function isStoreOrderTerminalStatus(orderStatus: string): boolean {
  return STORE_ORDER_TERMINAL_STATUSES.has(String(orderStatus ?? "").trim());
}

/**
 * FLW-03 — 구매자 주문 「목록에서 숨기기」 허용 상태 = 완료·취소·환불 완료.
 */
const STORE_ORDER_BUYER_HIDE_ALLOWED_STATUSES = new Set(["completed", "cancelled", "refunded"]);

export function isStoreOrderBuyerHideAllowedStatus(orderStatus: string): boolean {
  return STORE_ORDER_BUYER_HIDE_ALLOWED_STATUSES.has(String(orderStatus ?? "").trim());
}

export function normalizeStoreOrderCancelKind(raw: unknown): StoreOrderCancelKind | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s === "rejected" || s === "store" || s === "buyer" || s === "system" || s === "admin" ? s : null;
}

/**
 * 취소 이벤트 → 취소 구분. DB 트리거(`store_order_events_set_cancel_kind`)와 같은 규칙.
 * 접수 전(pending) 매장 취소 = 거절.
 */
export function storeOrderCancelKindFromEvent(
  fromStatus: string | null | undefined,
  actorRole: string | null | undefined
): StoreOrderCancelKind | null {
  const from = String(fromStatus ?? "").trim();
  const actor = String(actorRole ?? "").trim().toLowerCase();
  if (actor === "owner") return from === "pending" ? "rejected" : "store";
  if (actor === "buyer" || actor === "customer") return "buyer";
  if (actor === "system") return "system";
  if (actor === "admin") return "admin";
  return null;
}

/** 4칸 대표 상태 (배달: 주문접수·조리중·배달중·배달완료 / 픽업: 주문접수·조리중·픽업대기·픽업완료) */
export function processSteps(fulfillment: string): readonly StoreOrderProcessStepKey[] {
  return isDeliveryFulfillment(fulfillment)
    ? (["accepted", "preparing", "delivering", "completed"] as const)
    : (["accepted", "preparing", "ready_for_pickup", "completed"] as const);
}

/**
 * 단계 위치 — 0 접수 대기 · 1 주문접수 · 2 조리중 · 3 배달중/픽업대기 · 4 완료 · -1 터미널(취소·요청).
 * 예전 배달 주문의 ready_for_pickup 은 2(조리중), arrived 는 3(배달중).
 */
export function orderStagePosition(orderStatus: string, fulfillment: string): number {
  const s = String(orderStatus ?? "").trim();
  if (STORE_ORDER_TERMINAL_STATUSES.has(s)) return -1;
  const delivery = isDeliveryFulfillment(fulfillment);
  switch (s) {
    case "pending":
      return 0;
    case "accepted":
      return 1;
    case "preparing":
      return 2;
    case "ready_for_pickup":
      return delivery ? 2 : 3;
    case "delivering":
    case "arrived":
      return 3;
    case "completed":
      return 4;
    default:
      return 0;
  }
}

/** @deprecated 이름 호환 — `orderStagePosition` */
export function processStepIndex(orderStatus: string, fulfillment: string): number {
  return orderStagePosition(orderStatus, fulfillment);
}

/** 4칸 상태 — 완료면 모두 done, 터미널·접수 대기는 모두 upcoming */
export function processFlowStepStates(
  fulfillment: string,
  orderStatus: string
): StoreOrderFlowStepState[] {
  const pos = orderStagePosition(orderStatus, fulfillment);
  return [1, 2, 3, 4].map((cell) => {
    if (pos === 4) return "done";
    if (pos <= 0) return "upcoming";
    if (cell < pos) return "done";
    if (cell === pos) return "current";
    return "upcoming";
  });
}

/** 구매자 상세 — 같은 4칸 (`processFlowStepStates` 와 동일) */
export function processBuyerDetailStepStates(
  fulfillment: string,
  orderStatus: string
): StoreOrderFlowStepState[] {
  return processFlowStepStates(fulfillment, orderStatus);
}

function stageNameKey(status: string, fulfillment: string, cancelKind?: StoreOrderCancelKind | null): MessageKey | null {
  const delivery = isDeliveryFulfillment(fulfillment);
  switch (status) {
    case "pending":
      return "order_stage_pending";
    case "accepted":
      return "order_stage_accepted";
    case "preparing":
      return "order_stage_preparing";
    case "ready_for_pickup":
      return delivery ? "order_stage_preparing" : "order_stage_pickup_ready";
    case "delivering":
    case "arrived":
      return "order_stage_delivering";
    case "completed":
      return delivery ? "order_stage_delivered" : "order_stage_picked_up";
    case "cancelled":
      return cancelKind === "rejected" ? "order_stage_rejected" : "order_stage_cancelled";
    case "cancel_requested":
      return "order_stage_cancel_requested";
    case "refund_requested":
      return "order_stage_refund_requested";
    case "refunded":
      return "order_stage_refunded";
    default:
      return null;
  }
}

/**
 * 상태만 알고 주문 방식(배달/픽업)을 모를 때 쓰는 이름 키 (관리자 표·필터 등).
 * 완료 = 「완료」, ready_for_pickup = 「픽업대기」. 주문 방식을 알면 `orderStatusName` 을 쓴다.
 */
export const ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT = {
  pending: "order_stage_pending",
  accepted: "order_stage_accepted",
  preparing: "order_stage_preparing",
  ready_for_pickup: "order_stage_pickup_ready",
  delivering: "order_stage_delivering",
  arrived: "order_stage_delivering",
  completed: "order_stage_tab_done",
  cancel_requested: "order_stage_cancel_requested",
  cancelled: "order_stage_cancelled",
  refund_requested: "order_stage_refund_requested",
  refunded: "order_stage_refunded",
} as const satisfies Record<(typeof STORE_ORDER_STATUS_LIST)[number], MessageKey>;

/**
 * 주문 상태 이름 — 사장님·손님·채팅·알림·관리자 모두 이 함수 하나.
 * `cancelKind` 가 「rejected」이면 취소 대신 「주문 거절」.
 */
export function orderStatusName(
  orderStatus: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  cancelKind?: StoreOrderCancelKind | null
): string {
  const s = String(orderStatus ?? "").trim();
  const key = stageNameKey(s, fulfillment, cancelKind);
  return key ? translate(lang, key) : s;
}

/** 4칸 이름 */
export function orderStageNames(
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string[] {
  return processSteps(fulfillment).map((k) => orderStatusName(k, fulfillment, lang));
}

/** 칸 대표 키 → 이름 */
export function processStepLabel(
  stepKey: StoreOrderProcessStepKey,
  fulfillment: string,
  _audience: StoreOrderProcessAudience = "buyer",
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return orderStatusName(stepKey, fulfillment, lang);
}

/** 상태 이름 — 화면 구분(audience) 없이 같은 이름 */
export function processStatusLabel(
  orderStatus: string,
  fulfillment: string,
  _audience: StoreOrderProcessAudience = "buyer",
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  cancelKind?: StoreOrderCancelKind | null
): string {
  return orderStatusName(orderStatus, fulfillment, lang, cancelKind);
}

/** 구매자 주문 완료 화면 머리 — 단계 이름 그대로 */
export type BuyerOrderCompleteHeadlineTone = "success" | "progress" | "terminal";

export function buyerOrderCompleteHeadline(
  orderStatus: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  cancelKind?: StoreOrderCancelKind | null
): { label: string; tone: BuyerOrderCompleteHeadlineTone } {
  const status = String(orderStatus ?? "").trim();
  const label = orderStatusName(status, fulfillment, lang, cancelKind);
  if (status === "completed") return { label, tone: "success" };
  if (isStoreOrderTerminalStatus(status)) return { label, tone: "terminal" };
  return { label, tone: "progress" };
}

export type OwnerNextAction = { status: string; label: string } | null;

function actionKeyForNext(next: string, fulfillment: string): MessageKey | null {
  const delivery = isDeliveryFulfillment(fulfillment);
  switch (next) {
    case "accepted":
      return "order_action_accept";
    case "preparing":
      return "order_action_start_cooking";
    case "delivering":
      return "order_action_depart";
    case "ready_for_pickup":
      return delivery ? null : "order_action_pickup_ready";
    case "completed":
      return delivery ? "order_action_delivered" : "order_action_picked_up";
    default:
      return null;
  }
}

/** 사장님 버튼 이름 — 다음 상태로 보낼 때 */
export function labelForOwnerTransitionFromModel(
  lang: AppLanguageCode,
  current: string,
  next: string,
  fulfillment: string
): string {
  if (next === "cancelled") {
    return translate(lang, current === "pending" ? "order_action_reject" : "order_action_cancel");
  }
  const key = actionKeyForNext(next, fulfillment);
  return key ? translate(lang, key) : next;
}

/** 사장님 다음 버튼 1개 — 허용 전이 첫 진행(취소 제외) */
export function ownerNextAction(
  orderStatus: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): OwnerNextAction {
  const allowed = allowedOrderTransitions(orderStatus, fulfillment).filter((s) => s !== "cancelled");
  const next = allowed[0];
  if (!next) return null;
  return { status: next, label: labelForOwnerTransitionFromModel(lang, orderStatus, next, fulfillment) };
}

/** 사장님 확인창 질문 */
export function ownerTransitionConfirmQuestion(
  nextStatus: string,
  fulfillment: string,
  who: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const delivery = isDeliveryFulfillment(fulfillment);
  switch (nextStatus) {
    case "accepted":
      return translate(lang, "order_confirm_accept", { who });
    case "preparing":
      return translate(lang, "order_confirm_start_cooking");
    case "delivering":
      return translate(lang, "order_confirm_depart");
    case "ready_for_pickup":
      return translate(lang, "order_confirm_pickup_ready");
    case "completed":
      return translate(lang, delivery ? "order_confirm_delivered" : "order_confirm_picked_up");
    default:
      return translate(lang, "order_confirm_start_cooking");
  }
}

export type StoreOrderEventMessage = { key: MessageKey; params?: Record<string, string> };

/**
 * 사건 문장 — 채팅 줄·손님 푸시·알림함이 같은 문장 (§3-3).
 * 사유가 있으면 사유 붙은 문장, 없으면 사유 줄 없이.
 */
export function orderEventMessage(
  orderStatus: string,
  fulfillment: string,
  opts?: {
    prepMinutes?: number | null;
    cancelKind?: StoreOrderCancelKind | null;
    reason?: string | null;
    autoCancelMinutes?: number | null;
  }
): StoreOrderEventMessage | null {
  const s = String(orderStatus ?? "").trim();
  const delivery = isDeliveryFulfillment(fulfillment);
  const reason = String(opts?.reason ?? "").trim();
  switch (s) {
    case "accepted": {
      const m = opts?.prepMinutes;
      return m != null && m > 0
        ? { key: "order_event_accepted_prep", params: { minutes: String(m) } }
        : { key: "order_event_accepted" };
    }
    case "preparing":
      return { key: "order_event_preparing" };
    case "ready_for_pickup":
      return delivery ? null : { key: "order_event_pickup_ready" };
    case "delivering":
      return { key: "order_event_delivering" };
    case "arrived":
      return null;
    case "completed":
      return { key: delivery ? "order_event_delivered" : "order_event_picked_up" };
    case "cancelled": {
      switch (opts?.cancelKind) {
        case "rejected":
          return reason ? { key: "order_event_rejected_reason", params: { reason } } : { key: "order_event_rejected" };
        case "store":
          return reason
            ? { key: "order_event_store_cancelled_reason", params: { reason } }
            : { key: "order_event_store_cancelled" };
        case "buyer":
          return { key: "order_event_buyer_cancelled" };
        case "system": {
          const m = opts?.autoCancelMinutes;
          return m != null && m > 0
            ? { key: "order_event_auto_cancelled_minutes", params: { minutes: String(m) } }
            : { key: "order_event_auto_cancelled" };
        }
        case "admin":
          return { key: "order_event_admin_cancelled" };
        default:
          return { key: "order_event_cancelled" };
      }
    }
    case "cancel_requested":
      return reason
        ? { key: "order_event_cancel_requested_reason", params: { reason } }
        : { key: "order_event_cancel_requested" };
    case "refund_requested":
      return { key: "order_event_refund_requested" };
    case "refunded":
      return { key: "order_event_refunded" };
    default:
      return null;
  }
}

export function translateOrderEventMessage(
  msg: StoreOrderEventMessage | null,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  if (!msg) return "";
  return translate(lang, msg.key, msg.params);
}

/** 채팅 줄 키(사유 없는 형태) — 레거시 이름 호환 */
export function chatMessageKey(orderStatus: string, fulfillment: string): MessageKey | null {
  return orderEventMessage(orderStatus, fulfillment)?.key ?? null;
}

export function chatMessageKeyWithPrep(
  orderStatus: string,
  fulfillment: string,
  prepMinutes?: number
): MessageKey | null {
  return orderEventMessage(orderStatus, fulfillment, { prepMinutes })?.key ?? null;
}

/**
 * DEF-72 — DIBAY 운영팀 개입 사건 문장. 매장 문장과 분리.
 */
export function adminChatMessageKey(previousStatus: string, nextStatus: string): MessageKey {
  const prev = String(previousStatus ?? "").trim();
  const next = String(nextStatus ?? "").trim();
  if (next === "cancelled") {
    return prev === "cancel_requested" ? "order_event_admin_cancel_approved" : "order_event_admin_cancelled";
  }
  if (next === "refunded") return "order_event_admin_refunded";
  if (next === "refund_requested") return "order_event_admin_refund_requested";
  if (prev === "cancel_requested") return "order_event_admin_cancel_rejected";
  if (prev === "refund_requested") return "order_event_admin_refund_rejected";
  return "order_event_admin_status_updated";
}

/** 상태별 색 구분 — 같은 단계 = 같은 색 (사장님 배지·목록 공통) */
export type StoreOrderStageTone = "waiting" | "progress" | "done" | "danger" | "warning";

export function orderStageTone(orderStatus: string, fulfillment: string): StoreOrderStageTone {
  const s = String(orderStatus ?? "").trim();
  if (s === "cancelled" || s === "refunded") return "danger";
  if (s === "cancel_requested" || s === "refund_requested") return "warning";
  const pos = orderStagePosition(s, fulfillment);
  if (pos === 0) return "waiting";
  if (pos === 4) return "done";
  return "progress";
}

/** contract·회귀 검사용 */
export { STORE_ORDER_STATUS_LIST };
