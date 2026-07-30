/**
 * 메신저 master-detail 좌측 목록 pane 폭 — split 모드 전용 SSOT.
 *
 * 적용 조건: `matchesMessengerSplitViewport` = 768+ **AND** landscape.
 * DO NOT `min-[768px]:` 단독 — 세로 태블릿에서 pane/BottomNav 가 가로와 같이 줄어듦.
 *
 * split UI 안에서만 이 클래스를 쓴다(미디어 게이트 없음 — 부모가 이미 landscape split).
 * BottomNav left-only 폭: `app-bottom-nav.css` `@media … orientation: landscape`.
 */
export const MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS = "clamp(360px, 35vw, 470px)";

/** split 좌측 pane — 항상 clamp (hub 경로에서는 이 클래스를 쓰지 않음) */
export const MESSENGER_SPLIT_LIST_PANE_CLASS =
  "w-[clamp(360px,35vw,470px)] max-w-[470px] min-w-[360px] shrink-0";

export const MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS = `${MESSENGER_SPLIT_LIST_PANE_CLASS} border-r border-sam-border`;

/** `ConditionalAppShell` → BottomNav — CSS media(landscape) 가 폭을 담당 */
export const APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS = "app-bottom-nav-shell--messenger-split-list";
