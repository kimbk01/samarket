/**
 * 인라인 `style`·차트·서드파티에 넘길 때만 사용.
 * 일반 레이아웃은 Tailwind `bg-ui-*` 또는 `var(--ui-*)` 를 권장.
 *
 * 색·간격 변경: `app/design-tokens.css` 한 파일만 수정.
 */
export const UI_CSS = {
  pageBg: "var(--ui-page-bg)",
  surface: "var(--ui-surface)",
  fg: "var(--ui-text-primary)",
  muted: "var(--ui-text-secondary)",
  primary: "var(--ui-primary)",
  border: "var(--ui-border)",
  hoverSurface: "var(--ui-hover-surface)",
  danger: "var(--ui-danger)",
  success: "var(--ui-success)",
  radiusLg: "var(--ui-radius-lg)",
  shadowCard: "var(--ui-shadow-card)",
  tapMin: "var(--ui-tap-min)",
} as const;
