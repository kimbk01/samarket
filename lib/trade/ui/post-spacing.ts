/**
 * TRADE — 스티키 헤더 아래 ~ 첫 게시물까지 세로 간격
 *
 * 역할 분리 (메인 1단은 **포함하지 않음** — `lib/layout/main-tier1.ts`):
 * - `…MENU_TO_POSTS…` : 2단 없음 → **TRADE 메뉴 탭**(`TradePrimaryTabs`) 하단 ~ 첫 카드
 * - `…CATEGORY_BAR_TO_POSTS…` : 2단 있음 → **카테고리 앱바** 하단 ~ 첫 카드
 *
 * 레이아웃(`home/page`, `CategoryListLayout` trade)에서는 **상단 pt 를 두지 말 것**
 * (이 파일이 간격의 단일 출처가 되도록).
 */

/**
 * 마켓 리스트도 기존 피드와 동일하게 `<ul>`의 `PHILIFE_FEED_LIST_WRAP`(`pt-1`)만 사용한다.
 * 래퍼에서 상단 패딩을 추가하지 않는다.
 */
export const TRADE_GAP_MENU_TO_POSTS_CLASS = "pt-0";

/** 2단 카테고리 앱바가 있어도 동일 규칙(추가 상단 패딩 없음). */
export const TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS = "pt-0";

/** 기존 import 호환 */
export const TRADE_POSTS_GAP_WITHOUT_SECONDARY_TABS_CLASS = TRADE_GAP_MENU_TO_POSTS_CLASS;
export const TRADE_POSTS_GAP_WITH_SECONDARY_TABS_CLASS = TRADE_GAP_CATEGORY_BAR_TO_POSTS_CLASS;
