import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  labelForOwnerTransitionFromModel,
  orderStatusName,
  ownerTransitionConfirmQuestion,
  type StoreOrderCancelKind,
} from "@/lib/stores/store-order-process-model";

/** 사장님 버튼 문구 — `store-order-process-model` 4단계 정본 위임 */
export function labelForOwnerTransitionI18n(
  lang: AppLanguageCode,
  current: string,
  next: string,
  fulfillment: string
): string {
  return labelForOwnerTransitionFromModel(lang, current, next, fulfillment);
}

/** 사장님 확인창 질문 — 정본 위임 */
export function ownerOrderStepConfirmMessageI18n(
  lang: AppLanguageCode,
  buyerLabel: string,
  nextStatus: string,
  fulfillment: string
): string {
  const who = buyerLabel.trim() || translate(lang, "store_owner_confirm_buyer_fallback");
  return ownerTransitionConfirmQuestion(nextStatus, fulfillment, who, lang);
}

/** 사장님 배지 — 정본 상태 이름 */
export function ownerOpsStatusLabelI18n(
  lang: AppLanguageCode,
  status: string,
  fulfillment: string,
  cancelKind?: StoreOrderCancelKind | null
): string {
  return orderStatusName(status, fulfillment, lang, cancelKind);
}

const RIDER_STATUS_KEYS: Record<string, MessageKey> = {
  waiting_rider: "store_owner_rider_waiting",
  rider_assigned: "store_owner_rider_assigned",
  pickup_in_progress: "store_owner_rider_pickup_progress",
  delivering: "store_owner_rider_delivering",
  delivered: "store_owner_rider_delivered",
  delivery_failed: "store_owner_rider_failed",
};

export function ownerRiderStatusLabelI18n(lang: AppLanguageCode, status: string): string {
  const key = RIDER_STATUS_KEYS[status];
  return key ? translate(lang, key) : status;
}

const REVIEW_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "store_owner_review_status_pending",
  completed: "store_owner_review_status_completed",
  unavailable: "store_owner_review_status_unavailable",
};

export function ownerReviewStatusLabelI18n(
  lang: AppLanguageCode,
  status: string | null | undefined
): string {
  const s = String(status ?? "").trim();
  if (!s) return translate(lang, "store_owner_review_status_na");
  const key = REVIEW_STATUS_KEYS[s];
  return key ? translate(lang, key) : s;
}
