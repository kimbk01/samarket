import { APP_TIER1_HEADER_ICON_BTN_CLASS } from "@/lib/layout/app-tier1-header";
import { STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME } from "@/components/stores/StoreCommerceCartStrokeIcon";
import {
  DELIVERY_CONSUMER_HEADER_ACTION_GAP_PX,
  DELIVERY_CONSUMER_HEADER_ACTION_SIZE_PX,
} from "@/lib/design/delivery-chrome";

/** `/stores` 홈 녹색 헤더 — tier1 아이콘 버튼 + delivery 토큰 크기 */
export const STORES_HOME_HEADER_ICON_BTN_CLASS =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} relative !text-white hover:bg-white/10 active:bg-white/15`;

/** 카트·알림 수량 뱃지 — 녹색 헤더 (빨간 배경 · 흰 글씨) */
export const STORES_HOME_HEADER_COUNT_BADGE_CLASS =
  `absolute -right-0.5 -top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME} ring-[color:var(--delivery-home-header-bg)]`;

export const STORES_HOME_HEADER_BADGE_CLASS = STORES_HOME_HEADER_COUNT_BADGE_CLASS;

export const STORES_HOME_HEADER_NOTIF_BADGE_CLASS = STORES_HOME_HEADER_COUNT_BADGE_CLASS;

import { SAM_TIER1_HEADER_ICON_CLUSTER_CLASS } from "@/lib/ui/tier1-header-icon";

/** `@deprecated` — `DELIVERY_CONSUMER_HEADER_ACTION_*` 와 동일 (`.delivery-ui` 전역) */
export const STORES_HOME_HEADER_ACTIONS_GAP_PX = DELIVERY_CONSUMER_HEADER_ACTION_GAP_PX;
export const STORES_HOME_HEADER_ACTION_SIZE_PX = DELIVERY_CONSUMER_HEADER_ACTION_SIZE_PX;

export const STORES_HOME_HEADER_ACTIONS_CLUSTER =
  `${SAM_TIER1_HEADER_ICON_CLUSTER_CLASS} shrink-0`;

/**
 * `/stores` 녹색 홈·browse·입점 신청 헤더 — 단일 높이 계약.
 * 기본 밴드 = `--delivery-header-h`(52px) = `py-2` + `--delivery-header-action`(36px 행) + `py-2`.
 */
export const STORES_HOME_HEADER_SHELL_CLASS =
  "delivery-ui relative w-full shrink-0 bg-[color:var(--delivery-home-header-bg)] text-white";

/** 홈·browse·입점 — 52px 밴드 안에 액션 행 세로 중앙 (PTR 힌트는 행 아래 추가) */
export const STORES_HOME_HEADER_INNER_CLASS =
  "mx-auto flex w-full min-w-0 max-w-[768px] flex-col justify-center px-[var(--delivery-page-x)] py-2";

export const STORES_HOME_HEADER_ACTION_ROW_CLASS =
  "grid h-[length:var(--delivery-header-action)] items-center gap-1.5";

/** `/stores` 홈 1단 — 주소 열 최대 50% (`StoresHomeHeaderChrome`) */
export const STORES_HOME_HEADER_HOME_ADDRESS_ROW_GRID_CLASS = "grid-cols-[minmax(0,50%)_1fr]";

/** `/stores`·browse 공통 — 빨간 핀 + 주소 말줄임 + ▼ */
export const STORES_HOME_HEADER_ADDRESS_BUTTON_CLASS =
  "flex h-full min-w-0 w-full items-center gap-1 self-stretch text-left text-white";

export const STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS =
  "flex min-w-0 flex-1 items-center gap-1 overflow-hidden";

export const STORES_HOME_HEADER_ADDRESS_PIN_CLASS =
  "h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)] shrink-0 [&_svg]:h-full [&_svg]:w-full";

export const STORES_HOME_HEADER_ADDRESS_LINE_CLASS =
  "min-w-0 flex-1 truncate text-[15px] font-medium leading-none text-white";

export const STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS = "h-4 w-4 shrink-0 opacity-90";

/** browse 1단 — 뒤로 · 제목 · 우측 액션 */
export const STORES_HOME_HEADER_BROWSE_ROW_CLASS = "grid-cols-[auto_minmax(0,1fr)_auto]";

/** browse 2단 — `/stores` 와 동일 주소 형식(50% 열) */
export const STORES_HOME_HEADER_BROWSE_INNER_CLASS =
  "mx-auto flex w-full min-w-0 max-w-[768px] flex-col gap-1 px-[var(--delivery-page-x)] py-2";

/** browse 2단 — `/stores` 와 동일 좌측 정렬·50% 열 (뒤로 열 들여쓰기 없음) */
export const STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CLASS =
  `grid w-full min-w-0 items-center gap-1.5 ${STORES_HOME_HEADER_HOME_ADDRESS_ROW_GRID_CLASS}`;

/** browse 2단 — 핀·주소 표시만(비버튼), ▼ 별도 */
export const STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CONTENT_CLASS =
  STORES_HOME_HEADER_ADDRESS_BUTTON_CLASS;

export const STORES_HOME_HEADER_BROWSE_ADDRESS_CHEVRON_BTN_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/10 active:bg-white/15";

/** browse 3·4·5단 — 크림 배경 스택 (녹색 헤더 아래, 기기 좌우 패딩 정렬) */
export const STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS =
  "delivery-ui relative z-[4] w-full shrink-0 border-t border-white/15 bg-[var(--dibay-cream)]";

export const STORES_HOME_HEADER_BROWSE_TABS_INNER_CLASS =
  "relative mx-auto w-full min-w-0 max-w-[768px]";

/** browse 3단 — 1차 텍스트 탭 행(▼ 패널·2차 칩보다 위) */
export const STORES_HOME_HEADER_BROWSE_PRIMARY_TABS_ROW_CLASS =
  "relative z-[22] shrink-0 bg-[var(--dibay-cream)]";

/** 1차 ▼ 패널 — 크림 스택 상단(=2단 하단선), 4단(2차 칩) 위에 표시 */
export const STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_ANCHOR_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 z-[20]";

/** 1차 ▼ 패널 본체 */
export const STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_CLASS =
  "pointer-events-auto mx-auto w-full min-w-0 max-w-[768px] border-b border-[color:var(--delivery-border)] bg-[var(--dibay-cream)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

/** browse ▼ 딤 */
export const STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_BACKDROP_CLASS =
  "fixed inset-0 z-[18] cursor-default bg-black/25";

/** 2차 업종 행 — `/stores` 홈 `STORES_HOME_SUB_CATEGORY_SECTION_BODY` 와 동일 크기·패딩 */
export const STORES_HOME_HEADER_BROWSE_SUB_CHIPS_ROW_CLASS =
  "relative z-[1] w-full shrink-0 border-b border-[color:var(--delivery-border-section)] bg-[color:var(--delivery-bg-card)] pb-2 pt-0";

export const STORES_HOME_HEADER_BROWSE_TITLE_CLASS =
  "flex h-full min-w-0 flex-1 items-center truncate text-[15px] font-bold leading-none text-white";

/** 입점 신청 — 녹색 헤더 ↔ 첫 섹션 카드 간격 (Tailwind `2` = 8px) */
export const STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS = "mt-2";

/** 입점 신청 제목 — `--delivery-header-action` 행 안에서 수직 중앙 */
export const STORES_HOME_HEADER_APPLY_TITLE_CLASS =
  "flex h-full min-w-0 items-center truncate text-[length:var(--sector-header-title-size,17px)] font-bold leading-none tracking-[-0.3px] !text-[var(--dibay-cream)]";

/** `BodyPortal` 고정 시 본문 offset — 52px 밴드 + safe-area (홈·apply 동일) */
export const STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS =
  "pt-[calc(env(safe-area-inset-top,0px)+var(--delivery-header-h))]";

/** `@deprecated` — `STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS` 와 동일 */
export const STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS =
  STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS;
