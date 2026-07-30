/**
 * 앱 레이아웃 반응형 단일 기준 — `app/design-tokens.css` · `use-app-viewport-size.ts` 와 동기.
 *
 * - mobile / tablet portrait hub: 0–∞ 세로(portrait) — full hub (StickyHeader · 전폭 BottomNav)
 * - messenger split (master-detail): **min-width 768 AND orientation landscape only**
 *
 * DO NOT width-only 768 split — 태블릿 세로가 가로와 같은 split 에 묶여 스크롤·safe-top·BottomNav 가 깨짐.
 *
 * 오너 compact 셸(`owner-compact-shell-viewport.ts`, 1025)은 별도 — 메인 5탭 BottomNav 와 무관.
 */
export const APP_MOBILE_LAYOUT_MAX_PX = 767;
export const APP_MESSENGER_SPLIT_MIN_PX = 768;

/** CSS / matchMedia — 가로(landscape) + 넓은 폭만 master-detail */
export const APP_MESSENGER_SPLIT_MEDIA_QUERY = `(min-width: ${APP_MESSENGER_SPLIT_MIN_PX}px) and (orientation: landscape)`;

export function matchesMessengerSplitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(APP_MESSENGER_SPLIT_MEDIA_QUERY).matches;
}
