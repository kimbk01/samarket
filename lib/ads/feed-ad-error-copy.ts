/**
 * 피드 배너 오류 코드 → 한국어 안내 (화면·응답에 영어 코드값을 보이지 않는다).
 * FB-A10 (2026-11-04): 보상 연장·수정에서 DB 트리거 자리 없음 오류(`feed_ad_pool_capacity_full`)를 409 + 한국어로 바꾼다
 * — 등록·승인·연장 경로와 같은 변환(`isFeedAdPoolCapacityDbError`).
 */
import { isFeedAdPoolCapacityDbError } from "@/lib/ads/feed-ad-pool-capacity";

export const FEED_AD_CAPACITY_FULL_MESSAGE_KO = "자리가 없어 처리하지 못했습니다.";
/** FB-P09: 동시 승인에서 진 신청 — 보류 포인트 그대로 · 검토 중으로 남음 */
export const FEED_AD_APPROVE_LOST_CAPACITY_MESSAGE_KO =
  "자리가 차서 승인되지 않았습니다. 신청은 검토 중으로 남고, 보류된 포인트는 그대로입니다. 자리가 나면 다시 승인할 수 있습니다.";

export function feedAdPoolCapacityErrorResult(
  err: { message?: string | null } | null | undefined
): { error: "capacity_full"; httpStatus: 409; message: string } | null {
  if (!isFeedAdPoolCapacityDbError(err)) return null;
  return { error: "capacity_full", httpStatus: 409, message: FEED_AD_CAPACITY_FULL_MESSAGE_KO };
}

const KO: Record<string, string> = {
  capacity_full: FEED_AD_CAPACITY_FULL_MESSAGE_KO,
  capacity_check_failed: "남은 자리를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  destination_required: "목적지를 꼭 넣어 주세요. 목적지가 없는 배너는 만들 수 없습니다.",
  destination_id_required: "목적지 대상을 골라 주세요.",
  store_not_found: "매장을 찾지 못했습니다. 매장을 다시 골라 주세요.",
  store_lookup_failed: "매장을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  external_url_required: "외부 주소를 넣어 주세요.",
  https_required: "외부 주소는 https 로 시작해야 합니다.",
  invalid_url: "주소 형식이 올바르지 않습니다.",
  invalid_url_scheme: "쓸 수 없는 주소입니다.",
  internal_path_required: "앱 안 화면 주소(/ 로 시작)를 넣어 주세요.",
  internal_path_forbidden: "회원이 열 수 없는 화면 주소입니다.",
  invalid_destination_type: "목적지 종류가 올바르지 않습니다.",
  campaign_ended: "종료된 배너는 고칠 수 없습니다.",
  member_requested_creative_only: "회원이 신청한 배너는 소재만 고칠 수 있습니다.",
  invalid_period: "종료 시각이 시작 시각보다 늦어야 합니다.",
  invalid_priority: "우선순위는 숫자로 넣어 주세요.",
  status_changed: "그 사이 상태가 바뀌었습니다. 새로 불러와 주세요.",
  topic_not_targetable: "이 주제에는 배너를 걸 수 없습니다.",
  not_found: "배너를 찾지 못했습니다.",
  not_extendable: "지금 상태에서는 연장할 수 없습니다.",
  invalid_end: "종료 시각이 없어 연장할 수 없습니다.",
  reason_required: "사유를 넣어 주세요.",
  days_out_of_range: "연장 일수는 1~90일입니다.",
  not_active: "진행 중인 배너가 아니라 처리할 수 없습니다.",
  not_paused: "멈춘 배너가 아니라 다시 시작할 수 없습니다.",
  already_ended: "이미 종료된 배너입니다.",
  fault_required: "귀책(운영·회원·없음)을 골라 주세요.",
  public_reason_too_long: "공개 사유는 120자 이하로 써 주세요.",
  service_unavailable: "서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

/** 코드 → 한국어. 표에 없는 코드는 일반 문구(원문 코드는 보이지 않음). */
export function feedAdErrorMessageKo(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  return KO[c] ?? "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}
