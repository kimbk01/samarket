/**
 * 광고 3차 재감사 + 어드민 광고 SSOT 구현 (Owner 「설계안대로 진행」 2026-11-07) — 팝업·PTR·이벤트·신고 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1107PopupMessages = {
  ko: {
    /** D-06: 이벤트 저장으로 노출 중 팝업이 재검토로 내려감 */
    ads3_w2_event_popup_reverted_review: "팝업 그림·내용이 바뀌어 다시 승인이 필요합니다.",
    /** D-19: 같은 위치 히어로 순서 = 최근 수정 먼저 (`compareEventHeroBannerRows`) */
    ads3_w2_event_hero_order_hint: "같은 위치에 히어로 배너가 여러 개면 최근에 수정한 배너가 먼저 보입니다.",
    /** D-17: 신고 상세 → 피드 광고 상세 */
    ads3_w2_report_open_feed_ad: "광고 상세 보기",
  },
  en: {
    ads3_w2_event_popup_reverted_review: "The popup image or content changed, so it needs approval again.",
    ads3_w2_event_hero_order_hint: "If several hero banners share a placement, the most recently edited one shows first.",
    ads3_w2_report_open_feed_ad: "Open ad details",
  },
} as const;
