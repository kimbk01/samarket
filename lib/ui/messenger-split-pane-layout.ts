/**
 * 768px+ 메신저 master-detail 좌측 목록 pane 폭 — `CommunityMessengerHomeMasterDetail` SSOT.
 * Telegram 샤오미 실측(~35% / 1340→469) — clamp(360px, 35vw, 470px).
 * BottomNav left-only 폭도 동일 식 (`app-bottom-nav.css` · `--cm-split-list-pane-width`).
 */
export const MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS = "clamp(360px, 35vw, 470px)";

export const MESSENGER_SPLIT_LIST_PANE_CLASS =
  "w-full min-[768px]:w-[clamp(360px,35vw,470px)] min-[768px]:max-w-[470px] min-[768px]:min-w-[360px]";

export const MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS = `${MESSENGER_SPLIT_LIST_PANE_CLASS} min-[768px]:border-r border-sam-border`;

/** `ConditionalAppShell` → BottomNav — 메신저 ≥768 split 에서 좌측 pane 폭만 */
export const APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS = "app-bottom-nav-shell--messenger-split-list";
