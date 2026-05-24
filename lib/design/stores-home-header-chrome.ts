import { APP_TIER1_HEADER_ICON_BTN_CLASS } from "@/lib/layout/app-tier1-header";
import { STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME } from "@/components/stores/StoreCommerceCartStrokeIcon";

/** `/stores` 홈 녹색 헤더 — tier1 아이콘 버튼 + delivery 토큰 크기 */
export const STORES_HOME_HEADER_ICON_BTN_CLASS =
  `${APP_TIER1_HEADER_ICON_BTN_CLASS} relative text-white hover:bg-white/10 active:bg-white/15`;

/** 카트·알림 뱃지 — 아이콘 우상단에 접촉 */
export const STORES_HOME_HEADER_BADGE_CLASS =
  `absolute -right-0.5 -top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME} ring-[color:var(--delivery-home-header-bg)]`;

/** 알림 종 뱃지 — delivery primary on white (헤더 대비) */
export const STORES_HOME_HEADER_NOTIF_BADGE_CLASS =
  "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-[color:var(--delivery-primary)] ring-2 ring-[color:var(--delivery-home-header-bg)]";

import { SAM_TIER1_HEADER_ICON_CLUSTER_CLASS } from "@/lib/ui/tier1-header-icon";

export const STORES_HOME_HEADER_ACTIONS_CLUSTER = SAM_TIER1_HEADER_ICON_CLUSTER_CLASS;
