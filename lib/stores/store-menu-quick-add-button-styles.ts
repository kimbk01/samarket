/**
 * 매장 메뉴 썸네일 + 버튼 — WP6 (배민형 2차수 2026-10-29):
 * 흰 원 32px + 그림자 + 진한 기호, 초록 테두리 없음 (토큰 `--delivery-menu-plus-*`).
 * `@layer utilities` 로 preflight transparent 덮음.
 */
export const STORE_MENU_QUICK_ADD_BTN_VISUAL_CLASS = [
  "inline-flex shrink-0 items-center justify-center rounded-full p-0",
  "border-0 bg-white text-[color:var(--delivery-menu-plus-fg)]",
  "font-bold leading-none shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
  "[appearance:none] [-webkit-appearance:none]",
  "transition-[background-color,transform] duration-150",
  "active:scale-[0.96] active:bg-[color:var(--delivery-menu-plus-active-bg)]",
].join(" ");

export const STORE_MENU_QUICK_ADD_SIZE_CLASS = {
  list: "h-[var(--delivery-menu-plus-size)] w-[var(--delivery-menu-plus-size)] text-[length:var(--delivery-menu-plus-font-size)]",
  compact:
    "h-[var(--delivery-menu-plus-size-compact)] w-[var(--delivery-menu-plus-size-compact)] text-[length:var(--delivery-menu-plus-font-size-compact)]",
} as const;

/** + 글리프 — Pretendard bold 기준 시각적 중앙 (폰트 메트릭 보정) */
export const STORE_MENU_QUICK_ADD_GLYPH_BASE_CLASS =
  "pointer-events-none grid h-full w-full place-items-center leading-none";

export const STORE_MENU_QUICK_ADD_GLYPH_SIZE_CLASS = {
  list: "-translate-y-[1px]",
  compact: "-translate-y-[0.5px]",
} as const;

/** unlayered CSS 보조 — JSX utility 와 동일 토큰 (문서·테스트용) */
export const STORE_MENU_QUICK_ADD_TOKENS = {
  border: "transparent",
  bg: "#FFFFFF",
  fg: "var(--sam-fg)",
  activeBg: "var(--sam-surface-muted)",
} as const;
