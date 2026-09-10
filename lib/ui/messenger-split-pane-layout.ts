/**
 * 768px+ 메신저 master-detail 좌측 목록 pane 폭 — 전 클라이언트 공통 SSOT.
 * APK · iOS · Windows · tablet 동일: viewport ≥768 에서만 적용 (플랫폼 분기 금지).
 * Telegram 샤오미 실측(~35% / 1340→469) — clamp(360px, 35vw, 470px).
 *
 * BottomNav / 홈 device-bottom 아우터 시트 left·width 는 동일 CSS 변수·오프셋 체인:
 * `app/app-bottom-nav.css` · `app/messenger-home-bottom-sheet.css`
 * (`APP_MAIN_COLUMN_MAX_WIDTH_CLASS` rem 체인과 정렬).
 */
export const MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS = "clamp(360px, 35vw, 470px)";

export const MESSENGER_SPLIT_LIST_PANE_CLASS =
  "w-full min-[768px]:w-[clamp(360px,35vw,470px)] min-[768px]:max-w-[470px] min-[768px]:min-w-[360px]";

export const MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS = `${MESSENGER_SPLIT_LIST_PANE_CLASS} min-[768px]:border-r border-sam-border`;

/** `ConditionalAppShell` → BottomNav — ≥768 에서 좌측 pane 폭만 (전폭 금지) */
export const APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS = "app-bottom-nav-shell--messenger-split-list";

/**
 * Group Invite/Members/Info room overlay — bounded width SSOT (phone+wide).
 */
export const MESSENGER_GROUP_OVERLAY_SHEET_MAX_W_CLASS = "max-w-[min(100%,420px)]";

/**
 * 메신저 홈 device-bottom 아우터 시트(그룹 생성·설정·보관 등).
 * 마크업은 전 클라이언트 동일 클래스. 폭 축소는 CSS `@media (min-width:768px)` 만.
 * DO NOT JS 로 inset-x / width 를 제거해 폰 전폭을 깨지 말 것.
 */
export const MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS = "messenger-home-bottom-sheet-panel--split-list";
