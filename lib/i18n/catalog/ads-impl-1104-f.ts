/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 피드 배너 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1104FeedMessages = {
  ko: {
    /** FB-M13: 연장 응답이 끊김·5xx — 같은 키로 다시 확인 */
    feed_ad_renew_result_unknown: "연장 결과를 확인하지 못했습니다. 다시 누르면 같은 결제로 확인합니다.",
    /** FB-M13: 409 idempotency_consumed */
    feed_ad_renew_already_processed: "이미 처리된 연장입니다. 목록을 다시 불러왔습니다.",
  },
  en: {
    feed_ad_renew_result_unknown: "We could not confirm the renewal. Tap again to check the same payment.",
    feed_ad_renew_already_processed: "This renewal was already processed. The list has been refreshed.",
  },
} as const;
