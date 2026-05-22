/**
 * 주문 매장 상세·메뉴 시트 UI — delivery token 단일 축.
 */
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export const STORE_ORDER_BRAND = {
  accent: "var(--delivery-primary)",
  accentHover: "var(--delivery-primary-hover)",
  accentPressed: "var(--delivery-primary-active)",
  accentSoftBg: "var(--delivery-primary-soft)",
  accentSoftBgStrong: "var(--delivery-primary-soft)",
  accentSoftText: "var(--delivery-primary)",
  accentRing: "color-mix(in srgb, var(--delivery-primary) 35%, transparent)",
  /** 레거시 이름 유지 — 값은 accent 와 동일 */
  baeminMint: "var(--delivery-primary)",
  baeminPurple: "#6B3DF4",
  star: "#FFB400",
  starBright: "#FFC400",
  muted: "#888888",
  secondary: "#777777",
  title: "#111111",
  frameGray: "#f6f7f9",
  noticeBg: "#F4FBFD",
  chipInactiveBg: "#F2F3F5",
  chipInactiveFg: "#555555",
} as const;

/** 모바일 탭·아이콘 버튼 공통 — scale 로 눌림 피드백 */
export const STORE_ORDER_TOUCH_BTN =
  "touch-manipulation select-none transition-[transform,background-color,color,opacity] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:active:scale-100";

/** 메인 솔리드 CTA (담기·주문 등) — delivery DS 위임 */
export const STORE_ORDER_CTA_PRIMARY = [
  DeliveryTheme.btn.primary,
  DeliveryTheme.btn.sizeFull,
  DeliveryTheme.btn.sticky,
  STORE_ORDER_TOUCH_BTN,
].join(" ");

/** 보조 테두리 버튼 (수량 ± 등) */
export const STORE_ORDER_CTA_STEPPER =
  "touch-manipulation select-none rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-white text-[color:var(--delivery-text-main)] shadow-none transition-all duration-150 hover:bg-[color:var(--delivery-bg-soft)] active:scale-95 active:bg-[color:var(--delivery-primary-soft)] active:border-[color:var(--delivery-primary)] disabled:opacity-40 disabled:active:scale-100";

/** 뱃지 구분 — 배경·테두리로 역할이 한눈에 들어오게 */
export const STORE_ORDER_BADGE_POPULAR =
  "inline-flex h-[var(--delivery-badge-h)] items-center rounded-[var(--delivery-radius)] bg-[color:var(--delivery-badge-primary-bg)] px-[var(--delivery-badge-px)] text-[11px] font-bold tracking-wide text-[color:var(--delivery-badge-primary-fg)]";

export const STORE_ORDER_BADGE_REQUIRED =
  "inline-flex h-[var(--delivery-badge-h)] items-center rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary)] px-[var(--delivery-badge-px)] text-[11px] font-bold text-white";

export const STORE_ORDER_BADGE_OPTIONAL =
  "rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-semibold text-neutral-600 ring-1 ring-neutral-200/80";
