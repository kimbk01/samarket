/**
 * 인라인 `style`·차트·서드파티에 넘길 때만 사용.
 * 레이아웃은 Tailwind `bg-sam-app`, `bg-ui-page`(브리지), `var(--sam-*)` 권장.
 *
 * 전역 토큰: `app/design-tokens.css` — `--sam-*` 가 단일 소스, `--ui-*` 는 호환 브리지.
 */
export const SAM_CSS = {
  primary: "var(--sam-primary)",
  primaryHover: "var(--sam-primary-hover)",
  primarySoft: "var(--sam-primary-soft)",
  primarySoft2: "var(--sam-primary-soft-2)",
  primaryBorder: "var(--sam-primary-border)",
  bgApp: "var(--sam-bg-app)",
  bgSurface: "var(--sam-bg-surface)",
  bgSurfaceMuted: "var(--sam-bg-surface-muted)",
  bgChat: "var(--sam-bg-chat)",
  bgSoftPurple: "var(--sam-bg-soft-purple)",
  textPrimary: "var(--sam-text-primary)",
  textSecondary: "var(--sam-text-secondary)",
  textMuted: "var(--sam-text-muted)",
  textOnPrimary: "var(--sam-text-on-primary)",
  borderDefault: "var(--sam-border-default)",
  borderSoft: "var(--sam-border-soft)",
  success: "var(--sam-success)",
  successSoft: "var(--sam-success-soft)",
  warning: "var(--sam-warning)",
  warningSoft: "var(--sam-warning-soft)",
  danger: "var(--sam-danger)",
  dangerSoft: "var(--sam-danger-soft)",
  info: "var(--sam-info)",
  infoSoft: "var(--sam-info-soft)",
  iconDefault: "var(--sam-icon-default)",
  iconSoft: "var(--sam-icon-soft)",
  radiusXs: "var(--sam-radius-xs)",
  radiusSm: "var(--sam-radius-sm)",
  radiusMd: "var(--sam-radius-md)",
  radiusLg: "var(--sam-radius-lg)",
  radiusXl: "var(--sam-radius-xl)",
  radiusPill: "var(--sam-radius-pill)",
  shadowSoft: "var(--sam-shadow-soft)",
  shadowCard: "var(--sam-shadow-card)",
  screenPaddingX: "var(--sam-screen-padding-x)",
  tapMin: "var(--sam-tap-min)",
  fontBodyLine: "var(--sam-font-body-line)",
} as const;

/** @deprecated 새 코드는 `SAM_CSS` 또는 `bg-sam-*` 사용. 값은 `--sam-*` 로 통일됨. */
export { Sam } from "./sam-component-classes";

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
  /** 사각형 카드·섹션·시트 (원·`rounded-full` 제외) — `--sam-radius-sm` 브리지 */
  radiusRect: "var(--ui-radius-rect)",
  radiusLg: "var(--ui-radius-lg)",
  shadowCard: "var(--ui-shadow-card)",
  tapMin: "var(--ui-tap-min)",
} as const;
