/**
 * 회원 피드 배너 신청 실패 → 안내 문구 키 단일 정의 (광고 감사 FB-04 · 2026-11-26).
 *
 * 서버(`POST /api/me/feed-ad-requests`)는 오류 코드만 돌려준다(한국어 문장 없음).
 * 신청 화면은 이 함수 하나로 문구를 고른다 — 예전에는 일부 코드만 구분하고 나머지(꺼진 상품·주제 불가·
 * 목적지 오류 등)는 「신청 실패」 한 줄, 자리 없음은 서버 한국어 문장·화면 안 영어 삼항이었다.
 * (어드민 화면의 `feedAdErrorMessageKo` 는 이 작업 범위 밖 — 그대로 둔다.)
 */
import type { MessageKey } from "@/lib/i18n/messages";

const KEY_BY_CODE: Record<string, MessageKey> = {
  price_changed: "promo_price_changed",
  insufficient_balance: "points_ui_insufficient",
  product_not_found: "feed_ad_req_product_gone",
  capacity_full: "feed_ad_req_spot_full",
  capacity_check_failed: "feed_ad_req_check_failed",
  current_banner_exists: "feed_ad_req_current_exists",
  placement_domain_mismatch: "feed_ad_req_place_mismatch",
  invalid_placement: "feed_ad_req_place_mismatch",
  category_required: "feed_ad_req_need_category",
  topic_required: "feed_ad_req_need_topic",
  topic_not_targetable: "feed_ad_req_topic_not_targetable",
  creatives_required: "feed_ad_req_need_image",
  creatives_max_three: "feed_ad_req_need_image",
  creatives_max_one: "feed_ad_req_need_image",
  destination_required: "feed_ad_req_dest_required",
  destination_id_required: "feed_ad_req_need_own",
  external_url_required: "feed_ad_req_need_https",
  https_required: "feed_ad_req_need_https",
  invalid_url: "feed_ad_req_invalid_dest",
  invalid_url_scheme: "feed_ad_req_invalid_dest",
  invalid_destination_type: "feed_ad_req_invalid_dest",
  destination_not_mine: "feed_ad_req_dest_not_mine",
  destination_unavailable: "feed_ad_req_dest_not_mine",
  destination_check_failed: "feed_ad_req_check_failed",
};

export function feedAdMemberErrorKey(code: string | null | undefined): MessageKey {
  return KEY_BY_CODE[String(code ?? "").trim()] ?? "points_ui_request_failed";
}
