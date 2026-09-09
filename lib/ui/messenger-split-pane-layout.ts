/**
 * 768px+ 메신저 master-detail 좌측 목록 pane 폭 — `CommunityMessengerHomeMasterDetail` SSOT.
 * Telegram 샤오미 실측(~35% / 1340→469) — clamp(360px, 35vw, 470px).
 *
 * BottomNav 폭은 이 값에 묶지 않는다 — 메신저 landscape 도 global BottomNav 전폭
 * (`/market` 등과 동일). Owner UI contract 2026-09-10.
 */
export const MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS = "clamp(360px, 35vw, 470px)";

export const MESSENGER_SPLIT_LIST_PANE_CLASS =
  "w-full min-[768px]:w-[clamp(360px,35vw,470px)] min-[768px]:max-w-[470px] min-[768px]:min-w-[360px]";

export const MESSENGER_SPLIT_LIST_PANE_BORDER_CLASS = `${MESSENGER_SPLIT_LIST_PANE_CLASS} min-[768px]:border-r border-sam-border`;
