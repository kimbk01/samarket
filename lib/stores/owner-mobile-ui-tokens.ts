/** Devai-style store owner mobile dashboard — mockup-aligned tokens */

export const OWNER_MOBILE_BLUE = "#2D7FF9";
export const OWNER_MOBILE_BLUE_SOFT = "#E8F1FF";
export const OWNER_MOBILE_RED = "#FF4D4F";
export const OWNER_MOBILE_ORANGE = "#FA8C16";
export const OWNER_MOBILE_GREEN = "#52C41A";
export const OWNER_MOBILE_GRAY = "#8C8C8C";
export const OWNER_MOBILE_PAGE_BG = "#F3F4F6";
export const OWNER_MOBILE_CARD_BORDER = "#E5E7EB";

/** Fixed owner bottom nav — `BOTTOM_NAV_SHELL.heightClass` 와 동기 */
export const OWNER_MOBILE_BOTTOM_NAV_HEIGHT_CLASS = "h-[3.5rem]";

export const OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS =
  "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]";

/** 대시보드 인-content 헤더 카드 본문 높이(목업 기준) */
export const OWNER_HUB_HEADER_BODY_MIN_H_CLASS = "min-h-[4.25rem]";

/** 오너 고정 하단 네비 z-index (헤더·시트보다 낮고 본문보다 높음) */
export const OWNER_MOBILE_BOTTOM_NAV_Z_CLASS = "z-[55]";

/** Hub: shell main — safe-area only (고정 헤더·하단 네비는 대시보드 컴포넌트가 담당) */
export const OWNER_HUB_MAIN_TOP_PAD_CLASS = "pt-0";

/** 고정 매장 헤더 카드 높이 + safe-area (스크롤 본문 offset) */
export const OWNER_HUB_FIXED_HEADER_OFFSET_CLASS =
  "pt-[calc(env(safe-area-inset-top,0px)+4.75rem)]";

/** Orders page: fixed page header stack */
export const OWNER_ORDERS_HEADER_STACK_HEIGHT = "7.75rem";
export const OWNER_ORDERS_MAIN_TOP_PAD_CLASS =
  "pt-[calc(env(safe-area-inset-top,0px)+7.75rem)]";

export function ownerOrderStatusTone(status: string): {
  badgeBg: string;
  badgeText: string;
  stepActive: string;
} {
  switch (status) {
    case "pending":
      return {
        badgeBg: "bg-[#FF4D4F]",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_RED,
      };
    case "accepted":
    case "preparing":
      return {
        badgeBg: "bg-[#FA8C16]",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_ORANGE,
      };
    case "ready_for_pickup":
    case "delivering":
    case "arrived":
      return {
        badgeBg: "bg-[#1890FF]",
        badgeText: "text-white",
        stepActive: "#1890FF",
      };
    case "completed":
      return {
        badgeBg: "bg-[#52C41A]",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_GREEN,
      };
    case "cancelled":
    case "refunded":
      return {
        badgeBg: "bg-[#8C8C8C]",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_GRAY,
      };
    default:
      return {
        badgeBg: "bg-slate-500",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_BLUE,
      };
  }
}

export function ownerOrderStatusLabelKo(status: string): string {
  switch (status) {
    case "pending":
      return "신규";
    case "accepted":
      return "접수완료";
    case "preparing":
      return "진행중";
    case "ready_for_pickup":
      return "배달준비";
    case "delivering":
    case "arrived":
      return "배달중";
    case "completed":
      return "완료";
    case "cancelled":
      return "취소";
    case "refunded":
      return "취소";
    case "refund_requested":
      return "환불요청";
    default:
      return status;
  }
}
