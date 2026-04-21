/**
 * 피드·거래 리스트 카드 **1단**(상태 배지 + 같은 줄의 칩) 공통 규격.
 *
 * **적용 범위(동일 규칙):** 일반 중고, 부동산, 알바, 환전, 중고차 등 기존 스킨 전부.
 * **신규 거래 메뉴·스킨 추가 시:** 이 모듈의 상수만 조합해 1단을 구성한다.
 * (`buildPostListPreviewModel`의 `listingChips`, `TradeListingStatusBadge` / `listTradeStatusBadge` 등)
 *
 * **포함하지 않음:** 홈·마켓 **상단 가로 메뉴**(`APP_TOP_MENU_ROW1_*`) — 리스트 카드와 별도 토큰.
 */

export const APP_FEED_LIST_ROW1_LAYOUT =
  "inline-flex items-center justify-center rounded-ui-rect px-2.5 py-1 font-bold leading-none";

/** 카드 리스트(그리드) 행 */
export const APP_FEED_LIST_ROW1_TEXT_LIST = "sam-text-helper";

/** 상세·헤더 등 조금 큰 맥락 */
export const APP_FEED_LIST_ROW1_TEXT_DETAIL = "sam-text-body-secondary";

/** 리스트 1단 pill 베이스 — 배지·칩 공통(12px) */
export const APP_FEED_LIST_ROW1_PILL_LIST = `${APP_FEED_LIST_ROW1_LAYOUT} ${APP_FEED_LIST_ROW1_TEXT_LIST}`;
