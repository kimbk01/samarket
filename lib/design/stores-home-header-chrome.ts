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
 * `/stores` 녹색 홈·입점 신청 헤더 — 단일 높이 계약.
 * 전高 = `--delivery-page-x`(상단) + `--delivery-header-action`(36px 행) + `0.5rem`(하단).
 * (흰 browse 1단 `--sector-header-h` 52px 와는 별도 계열)
 */
export const STORES_HOME_HEADER_SHELL_CLASS =
  "delivery-ui relative w-full shrink-0 bg-[color:var(--delivery-home-header-bg)] text-white";

export const STORES_HOME_HEADER_INNER_CLASS =
  "mx-auto w-full min-w-0 max-w-[768px] px-[var(--delivery-page-x)] pb-2 pt-[var(--delivery-page-x)]";

export const STORES_HOME_HEADER_ACTION_ROW_CLASS =
  "grid h-[length:var(--delivery-header-action)] items-center gap-1.5";

/** 입점 신청 — 녹색 헤더 ↔ 첫 섹션 카드 간격 (Tailwind `2` = 8px) */
export const STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS = "mt-2";

/** 입점 신청 제목 — `--delivery-header-action` 행 안에서 수직 중앙 */
export const STORES_HOME_HEADER_APPLY_TITLE_CLASS =
  "flex h-full min-w-0 items-center truncate text-[length:var(--sector-header-title-size,17px)] font-bold leading-none tracking-[-0.3px] !text-[var(--dibay-cream)]";

/** `BodyPortal` 고정 시 본문 offset — 위 전高 + safe-area (홈·apply 동일) */
export const STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS =
  "pt-[calc(env(safe-area-inset-top,0px)+var(--delivery-page-x)+var(--delivery-header-action)+0.5rem)]";

/** `@deprecated` — `STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS` 와 동일 */
export const STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS =
  STORES_HOME_HEADER_FIXED_BODY_OFFSET_CLASS;
