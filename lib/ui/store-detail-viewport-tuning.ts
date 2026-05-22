/**
 * 매장 상세(메뉴 탭·히어로) 모바일·태블릿 뷰포트 보정 — 단일 소스.
 * 기기별 차이는 여기 숫자만 조정한다.
 */

/** `StoreOrderStickyHeader` — `app/delivery-tokens.css` `--delivery-header-h` 와 동일 */
export const STORE_DETAIL_HEADER_BAR_PX = 48;

/** 히어로 이미지 박스 아래 흰 요약 카드(이름·별점·픽업) 추정 높이 */
export const STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX = 168;

/** 배달/픽업 카드가 펼쳐진 경우 추가 추정 */
export const STORE_DETAIL_FULFILLMENT_CARD_ESTIMATE_PX = 88;

/** 앵커 1차 추정 보정(주소창·vv slack) */
export const STORE_DETAIL_TABS_ANCHOR_SLACK_PX = 4;

/** iOS Safari visualViewport offsetTop 반영 상한 */
export const STORE_DETAIL_VV_OFFSET_TOP_CAP_PX = 80;

/** 태블릿(가로) sticky top 추가 보정 */
export const STORE_DETAIL_TABLET_STICKY_TOP_EXTRA_PX = 0;

export const STORE_DETAIL_TABLET_MIN_WIDTH_PX = 768;

/** IntersectionObserver rootMargin 하단 여유 */
export const STORE_DETAIL_TABS_PIN_ROOT_MARGIN_BOTTOM_PX = 0;

/** 스크롤 pin 진입·해제 히스테리시스(px) */
export const STORE_DETAIL_TABS_PIN_ENTER_PX = 2;
export const STORE_DETAIL_TABS_PIN_EXIT_PX = 8;
