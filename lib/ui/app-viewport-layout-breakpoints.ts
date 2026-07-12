/**
 * 앱 레이아웃 반응형 단일 기준 — `app/design-tokens.css` · `use-app-viewport-size.ts` 와 동기.
 *
 * - mobile: 0–767
 * - messenger split (master-detail): 768+
 *
 * 오너 compact 셸(`owner-compact-shell-viewport.ts`, 1025)은 별도 — 메인 5탭 BottomNav 와 무관.
 */
export const APP_MOBILE_LAYOUT_MAX_PX = 767;
export const APP_MESSENGER_SPLIT_MIN_PX = 768;

export const APP_MESSENGER_SPLIT_MEDIA_QUERY = `(min-width: ${APP_MESSENGER_SPLIT_MIN_PX}px)`;

export function matchesMessengerSplitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(APP_MESSENGER_SPLIT_MEDIA_QUERY).matches;
}
