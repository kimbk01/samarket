/** Devai-style store owner mobile dashboard — mockup-aligned tokens */

export const OWNER_MOBILE_BLUE = "#2D7FF9";
export const OWNER_MOBILE_BLUE_SOFT = "#E8F1FF";

/** 오너 하단 탭 기본 활성 — 주문·대시보드 등 운영 메뉴 */
export const OWNER_MOBILE_BOTTOM_NAV_ACCENT = OWNER_MOBILE_BLUE;
export const OWNER_MOBILE_BOTTOM_NAV_ACCENT_SHADOW = "rgba(45, 127, 249, 0.24)";

/** 모바일 헤더 「나가기」— 소비자 배달·매장 탐색 허브 */
export const OWNER_MOBILE_EXIT_HREF = "/stores";
export const OWNER_MOBILE_RED = "#FF4D4F";
export const OWNER_MOBILE_ORANGE = "#FA8C16";
export const OWNER_MOBILE_GREEN = "#52C41A";
export const OWNER_MOBILE_GRAY = "#8C8C8C";
export const OWNER_MOBILE_PAGE_BG = "#F3F4F6";
export const OWNER_MOBILE_CARD_BORDER = "#E5E7EB";

/** `OwnerMobileBottomNav` 루트 — `app-bottom-nav.css` 오너 활성 색 스코프 */
export const OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS = "owner-mobile-bottom-nav";

/** Fixed owner bottom nav — `BOTTOM_NAV_SHELL.heightClass` 와 동기 */
export const OWNER_MOBILE_BOTTOM_NAV_HEIGHT_CLASS = "h-[3.5rem]";

export const OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS =
  "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]";

/** 오너 모바일 고정 헤더 z-index — 하단 네비(`z-[55]`)보다 위 */
export const OWNER_MOBILE_PAGE_HEADER_Z_CLASS = "z-[56]";

/** 주문 상세 풀스크린 — `BodyPortal` + 헤더(`z-[56]`)보다 위 */
export const OWNER_MOBILE_ORDER_DETAIL_OVERLAY_Z_CLASS = "z-[80]";

/** `OwnerStoreOrderDetailPanel` 루트 — viewport 전체, safe-area 상단 */
export const OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS = `fixed inset-0 flex min-h-0 flex-col bg-[#F3F4F6] ${OWNER_MOBILE_ORDER_DETAIL_OVERLAY_Z_CLASS} pt-[env(safe-area-inset-top,0px)]`;

/** 상세 하단 액션 푸터 — 홈 인디케이터 여백 */
export const OWNER_MOBILE_ORDER_DETAIL_FOOTER_PAD_CLASS =
  "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]";

/**
 * 오너 모바일 페이지 상단 헤더 — `StoresOwnerStackHeader` 와 동일하게 viewport 고정.
 * 반드시 `BodyPortal` 로 `document.body` 에 렌더(슬라이드 transform 조상 회피).
 * 스크롤은 본문만; safe-area + 툴바 `h-14` → `OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS`.
 */
export const OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS = `fixed inset-x-0 top-0 ${OWNER_MOBILE_PAGE_HEADER_Z_CLASS} w-full max-w-[100vw] border-b border-[#E5E7EB] bg-white pt-[env(safe-area-inset-top,0px)]`;

/** 고정 헤더 아래 본문 시작 offset (safe-area + 3.5rem 툴바) */
export const OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS =
  "pt-[calc(env(safe-area-inset-top,0px)+3.5rem)]";

/** 오너 모바일 본문·헤더 공통 가로 인셋 — 노치·둥근 모서리 safe-area + 최소 8px */
export const OWNER_MOBILE_PAGE_GUTTER_X_CLASS =
  "pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))]";

/** 앱 모바일 헤더 툴바 높이 — `StoresOwnerStackHeader` `h-14` 와 동기 */
export const OWNER_MOBILE_PAGE_HEADER_TOOLBAR_HEIGHT_CLASS = "h-14";

/**
 * 헤더 툴바 행 — flex(뒤로 · 제목 flex-1 · 액션 우측). `StoresOwnerStackHeader` 와 동일 패턴.
 */
export const OWNER_MOBILE_PAGE_HEADER_ROW_CLASS = `mx-auto flex w-full max-w-lg min-w-0 items-center gap-x-1 ${OWNER_MOBILE_PAGE_HEADER_TOOLBAR_HEIGHT_CLASS} ${OWNER_MOBILE_PAGE_GUTTER_X_CLASS}`;

/** 헤더 우측 아이콘 묶음 — 알림·메뉴·주문 검색/필터 등 */
export const OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS =
  "ml-auto flex shrink-0 items-center justify-end gap-0";

/** @deprecated 고정 헤더는 `OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS` 가 full-width. 하위 호환용 no-op */
export const OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS = "";

/** 모바일 운영 메뉴 드로어 — 열림: 우→좌, 닫힘: 좌→우 (ms) */
export const OWNER_MOBILE_DRAWER_TRANSITION_MS = 270;
export const OWNER_MOBILE_DRAWER_PANEL_TRANSITION_CLASS =
  "max-md:transition-transform max-md:duration-[270ms] max-md:ease-out";
export const OWNER_MOBILE_DRAWER_SCRIM_TRANSITION_CLASS =
  "transition-opacity duration-[270ms] ease-out";

/** 오너 고정 하단 네비 z-index (헤더·시트보다 낮고 본문보다 높음) */
export const OWNER_MOBILE_BOTTOM_NAV_Z_CLASS = "z-[55]";

/** @deprecated `OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS` 사용 */
export const OWNER_HUB_MAIN_TOP_PAD_CLASS = OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS;

/** @deprecated `OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS` 와 동일 */
export const OWNER_HUB_FIXED_HEADER_OFFSET_CLASS = OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS;

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
      return "주문접수";
    case "preparing":
    case "ready_for_pickup":
      return "준비(조리)중";
    case "delivering":
    case "arrived":
      return "배달중";
    case "completed":
      return "배달완료";
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
