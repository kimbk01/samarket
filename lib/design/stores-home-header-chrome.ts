import { APP_TIER1_HEADER_ICON_BTN_CLASS } from "@/lib/layout/app-tier1-header";
import { STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME } from "@/components/stores/StoreCommerceCartStrokeIcon";
import {
  DELIVERY_CONSUMER_HEADER_ACTION_GAP_PX,
  DELIVERY_CONSUMER_HEADER_ACTION_SIZE_PX,
} from "@/lib/design/delivery-chrome";

/** `/stores` 홈 녹색 헤더 — tier1 아이콘 버튼 + delivery 토큰 크기 */
export const STORES_HOME_HEADER_ICON_BTN_CLASS =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} relative text-white hover:bg-white/10 active:bg-white/15`;

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
