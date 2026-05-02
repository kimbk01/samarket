/**
 * 피드·거래 리스트 카드 **1단**(상태 배지 + 같은 줄의 칩) 공통 규격.
 *
 * **적용 범위(동일 규칙):** 일반 중고, 부동산, 알바, 환전, 중고차 등 기존 스킨 전부.
 * **신규 거래 메뉴·스킨 추가 시:** 이 모듈의 상수만 조합해 1단을 구성한다.
 * (`buildPostListPreviewModel`의 `listingChips`, `TradeListingStatusBadge` / `listTradeStatusBadge` 등)
 *
 * **포함하지 않음:** 홈·마켓 **상단 가로 메뉴**(`APP_TOP_MENU_ROW1_*`) — 리스트 카드와 별도 토큰.
 */

/** 패딩·모서리만 — 글자 크기·굵기는 `APP_FEED_LIST_ROW1_TEXT_*` 에 통일 */
export const APP_FEED_LIST_ROW1_LAYOUT =
  "inline-flex max-w-full items-center justify-center rounded-ui-rect px-2.5 py-1";

/**
 * 카드 리스트 1단 — **상태 배지(판매중·문의중) + 칩(임대·알바·스킨명 등) 동일 규격**
 * (구 `sam-text-helper`와 달리 크기·bold 단일 — 칩과 배지가 어긋나지 않음)
 */
export const APP_FEED_LIST_ROW1_TEXT_LIST =
  "text-[length:calc(12px-1pt)] font-bold leading-none";

/** 상세·헤더 등 한 단계 큰 맥락 — 목록과 비율만 맞춤 */
export const APP_FEED_LIST_ROW1_TEXT_DETAIL =
  "text-[length:calc(13px-1pt)] font-bold leading-none";

/** 리스트 1단 pill 베이스 — 배지·회색·색상 칩 모두 이 문자열에서 시작 */
export const APP_FEED_LIST_ROW1_PILL_LIST = `${APP_FEED_LIST_ROW1_LAYOUT} ${APP_FEED_LIST_ROW1_TEXT_LIST}`;
