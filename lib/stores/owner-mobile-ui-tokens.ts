import {
  OWNER_COMPACT_SHELL_MAX_TW,
} from "@/lib/business/owner-compact-shell-viewport";
import {
  OWNER_COMPACT_SHELL_BLEED_X_CLASS,
  OWNER_COMPACT_SHELL_COLUMN_CLASS,
  OWNER_COMPACT_SHELL_HEADER_CLASS,
  OWNER_COMPACT_SHELL_HEADER_INNER_CLASS,
  OWNER_COMPACT_SHELL_MAIN_CLASS,
  OWNER_COMPACT_SHELL_MAIN_PB_CLASS,
  OWNER_COMPACT_SHELL_SCROLL_CLASS,
} from "@/lib/business/owner-compact-shell-layout";

/** Store owner mobile operations dashboard — Starbucks-inspired owner tokens */

export const OWNER_MOBILE_BLUE = "#0B421A";
export const OWNER_MOBILE_BLUE_SOFT = "color-mix(in srgb, #0B421A 8%, #FFFCFC)";
export const OWNER_OPS_GREEN = "#0B421A";
export const OWNER_OPS_DEEP_GREEN = "#362415";
export const OWNER_OPS_APP_BG = "color-mix(in srgb, #EAC784 10%, #FFFCFC)";
export const OWNER_OPS_SURFACE = "#FFFCFC";
export const OWNER_OPS_BORDER = "color-mix(in srgb, #604C4C 22%, #FFFCFC)";

/** 오너 하단 탭 기본 활성 — 주문·대시보드 등 운영 메뉴 */
export const OWNER_MOBILE_BOTTOM_NAV_ACCENT = OWNER_MOBILE_BLUE;
export const OWNER_MOBILE_BOTTOM_NAV_ACCENT_SHADOW = "rgba(11, 66, 26, 0.24)";

/** 모바일 헤더 「나가기」— 소비자 배달·매장 탐색 허브 */
export const OWNER_MOBILE_EXIT_HREF = "/stores";
export const OWNER_MOBILE_RED = "#FF4D4F";
export const OWNER_MOBILE_ORANGE = "#FA8C16";
export const OWNER_MOBILE_GREEN = OWNER_OPS_GREEN;
export const OWNER_MOBILE_GRAY = "#604C4C";
export const OWNER_MOBILE_PAGE_BG = OWNER_OPS_APP_BG;
export const OWNER_MOBILE_CARD_BORDER = OWNER_OPS_BORDER;

/** `OwnerMobileBottomNav` 루트 — 배달 하단 탭 셸(`app-bottom-nav-shell--delivery`)과 동일 */
export const OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS =
  "owner-mobile-bottom-nav app-bottom-nav-shell--delivery";

/** Fixed owner bottom nav — `BOTTOM_NAV_SHELL.heightClass` 와 동기 */
export const OWNER_MOBILE_BOTTOM_NAV_HEIGHT_CLASS = "h-[60px]";

/** 하단 탭 + safe-area — `owner-compact-shell.css` `--owner-shell-main-pb` (body `data-owner-compact-shell`) */
export const OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS = OWNER_COMPACT_SHELL_MAIN_PB_CLASS;

/** 오너 모바일 고정 헤더 z-index — 하단 네비(`z-[55]`)보다 위 (CSS `.owner-compact-shell__header` 와 동기) */
export const OWNER_MOBILE_PAGE_HEADER_Z_CLASS = "z-[56]";

/** 주문 상세 풀스크린 — `BodyPortal` + 헤더(`z-[56]`)보다 위 */
export const OWNER_MOBILE_ORDER_DETAIL_OVERLAY_Z_CLASS = "z-[80]";

/** `OwnerStoreOrderDetailPanel` 루트 — viewport 전체, safe-area 상단 */
export const OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS = `fixed inset-0 flex min-h-0 flex-col bg-[var(--biz-app-bg)] ${OWNER_MOBILE_ORDER_DETAIL_OVERLAY_Z_CLASS} pt-[env(safe-area-inset-top,0px)]`;

/** 상세 하단 액션 푸터 — 홈 인디케이터 여백 */
export const OWNER_MOBILE_ORDER_DETAIL_FOOTER_PAD_CLASS =
  "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]";

/**
 * 오너 컴팩트 고정 헤더 — `BodyPortal` + `owner-compact-shell.css`.
 * 기기별 폭·좌우 패딩·상단 safe-area 는 `body[data-owner-compact-shell]` 변수가 결정한다.
 */
export const OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS = OWNER_COMPACT_SHELL_HEADER_CLASS;

/** 헤더 툴바 행 — 본문 column 과 동일 max-width·gutter */
export const OWNER_MOBILE_PAGE_HEADER_ROW_CLASS = OWNER_COMPACT_SHELL_HEADER_INNER_CLASS;

/** 고정 헤더 아래 main 시작 — `owner-compact-shell__main` padding-top */
export const OWNER_MOBILE_PAGE_HEADER_MAIN_OFFSET_CLASS = OWNER_COMPACT_SHELL_MAIN_CLASS;

/**
 * @deprecated 컴팩트 셸은 `owner-compact-shell__column` 이 패딩을 담당. 신규 코드는 column 부모만 사용.
 */
export const OWNER_MOBILE_PAGE_GUTTER_X_CLASS = "";

export const OWNER_MOBILE_ADMIN_CONTENT_GUTTER_X_CLASS = OWNER_MOBILE_PAGE_GUTTER_X_CLASS;

/** main column + 풀폭 스트립 bleed — CSS 변수와 동일 inset */
export const OWNER_MOBILE_ADMIN_CONTENT_GUTTER_NEG_X_CLASS = OWNER_COMPACT_SHELL_BLEED_X_CLASS;

/** @deprecated `owner-compact-shell__column` 사용 */
export const OWNER_MOBILE_ADMIN_MAIN_MAX_WIDTH_CLASS = OWNER_COMPACT_SHELL_COLUMN_CLASS;

/** 앱 모바일 헤더 툴바 높이 — `--sam-header-row-height` / CSS `--owner-shell-toolbar-h` */
export const OWNER_MOBILE_PAGE_HEADER_TOOLBAR_HEIGHT_CLASS = "h-14";

/** 헤더 우측 아이콘 묶음 — 알림·메뉴·주문 검색/필터 등 */
export const OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS =
  "ml-auto flex shrink-0 items-center justify-end gap-0";

/** @deprecated no-op */
export const OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS = "";

/** 모바일 운영 메뉴 드로어 — 열림: 우→좌, 닫힘: 좌→우 (ms) */
export const OWNER_MOBILE_DRAWER_TRANSITION_MS = 270;
export const OWNER_MOBILE_DRAWER_PANEL_TRANSITION_CLASS =
  `${OWNER_COMPACT_SHELL_MAX_TW}:transition-transform ${OWNER_COMPACT_SHELL_MAX_TW}:duration-[270ms] ${OWNER_COMPACT_SHELL_MAX_TW}:ease-out`;
export const OWNER_MOBILE_DRAWER_SCRIM_TRANSITION_CLASS =
  "transition-opacity duration-[270ms] ease-out";

/** 오너 고정 하단 네비 z-index (헤더·시트보다 낮고 본문보다 높음) */
export const OWNER_MOBILE_BOTTOM_NAV_Z_CLASS = "z-[55]";

/** 본문 스크롤 영역 — 대시·주문 목록 등 */
export const OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS = OWNER_COMPACT_SHELL_SCROLL_CLASS;

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
        badgeBg: "bg-[var(--biz-primary)]",
        badgeText: "text-white",
        stepActive: OWNER_OPS_GREEN,
      };
    case "completed":
      return {
        badgeBg: "bg-[#E5E5E5]",
        badgeText: "text-[var(--biz-text)]",
        stepActive: OWNER_MOBILE_GRAY,
      };
    case "refund_requested":
      return {
        badgeBg: "bg-[#B45309]",
        badgeText: "text-white",
        stepActive: OWNER_MOBILE_ORANGE,
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
      return "배달중";
    case "arrived":
      return "배송지 도착";
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
