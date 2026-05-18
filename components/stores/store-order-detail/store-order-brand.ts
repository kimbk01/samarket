/**
 * 주문 매장 상세·메뉴 시트 UI — dibaY delivery primary `#2386B1` 단일 축.
 */
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export const STORE_ORDER_BRAND = {
  accent: "#2386B1",
  accentHover: "#1F789F",
  accentPressed: "#1a6a8f",
  accentSoftBg: "#EAF6FB",
  accentSoftBgStrong: "#EEF8FC",
  accentSoftText: "#2386B1",
  accentRing: "rgba(35, 134, 177, 0.35)",
  /** 레거시 이름 유지 — 값은 accent 와 동일 */
  baeminMint: "#2386B1",
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
  "touch-manipulation select-none rounded-full border border-neutral-200 bg-white text-neutral-900 shadow-sm transition-all duration-150 hover:bg-neutral-50 active:scale-95 active:bg-[#EAF6FB] active:border-[#2386B1]/35 disabled:opacity-40 disabled:active:scale-100";

/** 뱃지 구분 — 배경·테두리로 역할이 한눈에 들어오게 */
export const STORE_ORDER_BADGE_POPULAR =
  "inline-flex items-center rounded-[4px] bg-[#EAF6FB] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#2386B1] ring-1 ring-[#2386B1]/15";

export const STORE_ORDER_BADGE_REQUIRED =
  "rounded-full bg-[#2386B1] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-[#2386B1]/30";

export const STORE_ORDER_BADGE_OPTIONAL =
  "rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-semibold text-neutral-600 ring-1 ring-neutral-200/80";
