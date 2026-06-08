import { ADDR_SB_GREEN, ADDR_SB_MINT } from "@/lib/ui/address-list-starbucks-styles";

/**
 * 매장 메뉴 썸네일 + 버튼 — 하단 카트 아이콘(`STORE_COMMERCE_ACTION_CART_ICON_BTN_CLASS`)과 동일:
 * 흰 배경 + 스타벅스 그린 테두리 + 그린 기호. `@layer utilities` 로 preflight transparent 덮음.
 */
export const STORE_MENU_QUICK_ADD_BTN_VISUAL_CLASS = [
  "inline-flex shrink-0 items-center justify-center rounded-full p-0",
  "border-2 border-[#00704A] bg-white text-[#00704A]",
  "font-bold leading-none shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
  "[appearance:none] [-webkit-appearance:none]",
  "transition-[background-color,transform] duration-150",
  "active:scale-[0.96] active:bg-[#E8F3EE]",
].join(" ");

export const STORE_MENU_QUICK_ADD_SIZE_CLASS = {
  list: "h-[var(--delivery-menu-plus-size)] w-[var(--delivery-menu-plus-size)] text-[length:var(--delivery-menu-plus-font-size)]",
  compact:
    "h-[var(--delivery-menu-plus-size-compact)] w-[var(--delivery-menu-plus-size-compact)] text-[length:var(--delivery-menu-plus-font-size-compact)]",
} as const;

/** + 글리프 — Pretendard 기준 시각적 중앙 */
export const STORE_MENU_QUICK_ADD_GLYPH_CLASS =
  "pointer-events-none flex h-full w-full items-center justify-center leading-none translate-y-[0.5px]";

/** unlayered CSS 보조 — JSX utility 와 동일 hex (문서·테스트용) */
export const STORE_MENU_QUICK_ADD_TOKENS = {
  border: ADDR_SB_GREEN,
  bg: "#FFFFFF",
  fg: ADDR_SB_GREEN,
  activeBg: ADDR_SB_MINT,
} as const;
