/**
 * 내정보 주문 내역·상세(S30·S31) 화면 규칙 — 순수 함수 (단위 테스트 대상).
 *
 * - 탭 `?tab=all|active|done|issue` (C4: 설계 3탭 + 기존 [전체] 유지).
 * - 서버 오류 코드는 화면에 그대로 노출하지 않는다 — i18n 키로만 변환(C.0.2 상태 4종).
 * - 상세 하단 고정 CTA 는 상태별 1주 + 1보조(S31).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { MemberOrderTab } from "@/lib/member-orders/types";

export const MEMBER_ORDER_TAB_VALUES: readonly MemberOrderTab[] = ["all", "active", "done", "issue"];

export type StoreOrderMutationKind = "cancel" | "request_cancel" | "hide";

/** PATCH/DELETE 실패 코드 → 사용자 문구 키 (코드 원문 노출 금지) */
export function resolveStoreOrderMutationErrorKey(
  kind: StoreOrderMutationKind,
  code: string | null | undefined
): MessageKey {
  const c = String(code ?? "").trim();
  if (kind === "cancel") {
    if (c === "cannot_cancel_after_accepted") return "mypage_comp_orders_cancel_err_short";
    return "mypage_oa_cancel_failed";
  }
  if (kind === "request_cancel") {
    if (c === "cannot_request_cancel") return "mypage_comp_cancel_req_err_cannot";
    if (c === "cancel_reason_required") return "mypage_comp_cancel_req_reason_required";
    return "mypage_oa_request_failed";
  }
  if (c === "buyer_hide_schema_missing") return "mypage_comp_orders_hide_schema_missing";
  return "mypage_oa_hide_failed";
}

/** 목록·상세 첫 로딩 실패 문구 — 서비스 미설정(503)만 별도 안내, 나머지는 공통 문구 */
export function resolveStoreOrdersLoadErrorKey(code: string | null | undefined): MessageKey {
  return String(code ?? "").trim() === "supabase_unconfigured"
    ? "mypage_comp_orders_supabase_unconfigured"
    : "mypage_oa_orders_load_failed";
}

/** 취소 요청 사유 — 2~500자 (기존 textarea 규칙 그대로) */
export const STORE_ORDER_CANCEL_REASON_MIN = 2;
export const STORE_ORDER_CANCEL_REASON_MAX = 500;

export function isStoreOrderCancelReasonValid(reason: string): boolean {
  const n = reason.trim().length;
  return n >= STORE_ORDER_CANCEL_REASON_MIN && n <= STORE_ORDER_CANCEL_REASON_MAX;
}

export type StoreOrderDetailCtaAction =
  | "order_chat"
  | "view_store"
  | "order_list"
  | "cancel_order"
  | "request_cancel"
  | "reorder"
  | "receipt";

export type StoreOrderDetailCtaPlan = {
  primary: StoreOrderDetailCtaAction | null;
  secondary: StoreOrderDetailCtaAction | null;
};

/**
 * S31 하단 고정 CTA 매트릭스 (상태별 1주 + 1보조).
 * - 결제 전 취소 가능 → 주 [주문 취소] (확인 시트) · 보조 [매장 보기]
 * - 결제 후 취소 요청 가능 → 주 [취소 요청] (사유 시트) · 보조 [주문 채팅] (채팅 가능 시) / [매장 보기]
 * - 완료 → 주 [재주문] (재주문 가능 시) · 보조 [주문 내역서]
 * - 진행중(그 외) → 주 [주문 채팅] · 보조 [매장 보기]
 * - 채팅 불가·매장 없음 → 해당 버튼 생략(주가 비면 보조를 주로 올림)
 */
export function resolveStoreOrderDetailCtaPlan(input: {
  orderStatus: string;
  canBuyerCancel: boolean;
  canRequestCancel: boolean;
  chatDisabled: boolean;
  hasStore: boolean;
  canReorder: boolean;
}): StoreOrderDetailCtaPlan {
  const storeOrList: StoreOrderDetailCtaAction = input.hasStore ? "view_store" : "order_list";
  let plan: StoreOrderDetailCtaPlan;
  if (input.canBuyerCancel) {
    plan = { primary: "cancel_order", secondary: storeOrList };
  } else if (input.canRequestCancel) {
    plan = { primary: "request_cancel", secondary: input.chatDisabled ? storeOrList : "order_chat" };
  } else if (input.orderStatus.trim() === "completed") {
    plan = { primary: input.canReorder ? "reorder" : null, secondary: "receipt" };
  } else {
    plan = { primary: input.chatDisabled ? null : "order_chat", secondary: storeOrList };
  }
  if (!plan.primary && plan.secondary) return { primary: plan.secondary, secondary: null };
  return plan;
}

/**
 * 주문 직후 시드 화면 상태 문구 (Part D SSOT — 주문 상태 문구) — 시드의 수령 방식으로
 * `buyerOrderStatusLabel` 을 부른다. 구 세션 캐시처럼 수령 방식이 없고 배달/픽업 문구가 다르면
 * 수령 방식 중립 문구(`neutralLabel`)를 쓴다(픽업 주문에 배달 문구 금지).
 */
export function storeOrderSeedStatusLabel(
  seed: { order_status: string; fulfillment_type?: string | null },
  lang: AppLanguageCode,
  neutralLabel: string
): string {
  const ft = String(seed.fulfillment_type ?? "").trim();
  if (ft) return buyerOrderStatusLabel(seed.order_status, lang, ft);
  const delivery = buyerOrderStatusLabel(seed.order_status, lang, "local_delivery");
  const pickup = buyerOrderStatusLabel(seed.order_status, lang, "pickup");
  return delivery === pickup ? delivery : neutralLabel;
}
