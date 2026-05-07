/**
 * 주문 매장 상세·메뉴 시트 UI — 브랜드 청록 `#1C8DB8` 단일 축.
 * (Baemin 레퍼런스 밀도·레이아웃만 참고, 민트 CTA 등 레거시 색은 accent 로 통일)
 */
export const STORE_ORDER_BRAND = {
  accent: "#1C8DB8",
  accentHover: "#197DA3",
  accentPressed: "#166F92",
  /** 필·옵션 리스트 배경 틴트 */
  accentSoftBg: "#E6F4F9",
  accentSoftBgStrong: "#EEF8FC",
  accentSoftText: "#1C8DB8",
  accentRing: "rgba(28, 141, 184, 0.35)",
  /** 레거시 이름 유지 — 값은 accent 와 동일 */
  baeminMint: "#1C8DB8",
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

/** 메인 솔리드 CTA (담기·주문 등) */
export const STORE_ORDER_CTA_PRIMARY =
  "touch-manipulation select-none rounded-[10px] bg-[#1C8DB8] text-center font-extrabold text-white shadow-sm transition-all duration-150 hover:bg-[#197DA3] active:bg-[#166F92] active:scale-[0.98] disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none disabled:active:scale-100";

/** 보조 테두리 버튼 (수량 ± 등) */
export const STORE_ORDER_CTA_STEPPER =
  "touch-manipulation select-none rounded-full border border-neutral-200 bg-white text-neutral-900 shadow-sm transition-all duration-150 hover:bg-neutral-50 active:scale-95 active:bg-[#E6F4F9] active:border-[#1C8DB8]/35 disabled:opacity-40 disabled:active:scale-100";

/** 뱃지 구분 — 배경·테두리로 역할이 한눈에 들어오게 */
export const STORE_ORDER_BADGE_POPULAR =
  "inline-flex items-center rounded-[4px] bg-[#E6F4F9] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#1C8DB8] ring-1 ring-[#1C8DB8]/15";

export const STORE_ORDER_BADGE_REQUIRED =
  "rounded-full bg-[#1C8DB8] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-[#1C8DB8]/30";

export const STORE_ORDER_BADGE_OPTIONAL =
  "rounded-full bg-neutral-100 px-2 py-0.5 text-[12px] font-semibold text-neutral-600 ring-1 ring-neutral-200/80";
