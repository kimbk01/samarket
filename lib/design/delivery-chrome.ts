/**
 * 배달 소비자 화면 — 상단 바·페이지 배경 단일 계약 (배민 구조 + 스타벅스 팔레트).
 *
 * | 화면 | 바 높이 | 제목 위치 | 제목 타이포 |
 * | 앱 1단(뒤로·제목·우측) | 48px | 좌측 20% | 17px / 700 |
 * | 햄버거 탐색 1단 | 기존 56px 레이아웃 유지 — 변경 금지 |
 */

import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import {
  APP_TIER1_HEADER_ACTIONS_CLASS,
  APP_TIER1_HEADER_ICON_BTN_CLASS,
  APP_TIER1_HEADER_LAYOUT_ROW_CLASS,
  APP_TIER1_HEADER_LEADING_CLASS,
  APP_TIER1_HEADER_ROW_WRAP_CLASS,
  APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS,
  APP_TIER1_HEADER_TITLE_SLOT_CLASS,
} from "@/lib/layout/app-tier1-header";

/** 페이지 본문 — #f6f6f6, 카드·헤더 바는 흰색 */
export const DELIVERY_PAGE_SURFACE_CLASS = DeliveryTheme.page;

/** 모든 소비자 배달 헤더 바 — 흰 배경·하단 1px */
export const DELIVERY_CONSUMER_HEADER_BAR_CLASS =
  "w-full min-w-0 shrink-0 border-b border-[color:var(--delivery-header-bar-border)] bg-[color:var(--delivery-header-bar-bg)]";

export const DELIVERY_CONSUMER_HEADER_ROW_CLASS = APP_TIER1_HEADER_ROW_WRAP_CLASS;
export const DELIVERY_CONSUMER_HEADER_LAYOUT_ROW_CLASS = APP_TIER1_HEADER_LAYOUT_ROW_CLASS;
export const DELIVERY_CONSUMER_HEADER_LEADING_CLASS = APP_TIER1_HEADER_LEADING_CLASS;
export const DELIVERY_CONSUMER_HEADER_TITLE_SLOT_CLASS = APP_TIER1_HEADER_TITLE_SLOT_CLASS;
export const DELIVERY_CONSUMER_HEADER_TITLE_IN_SLOT_CLASS = APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS;
export const DELIVERY_CONSUMER_HEADER_ACTIONS_CLASS = APP_TIER1_HEADER_ACTIONS_CLASS;
export const DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS = APP_TIER1_HEADER_ICON_BTN_CLASS;

/** 1단·서브·매장 고정 공통 제목 */
export const DELIVERY_CONSUMER_HEADER_TITLE_CLASS =
  "sam-tier1-header__title text-[length:var(--delivery-fs-header-title)] font-bold leading-[var(--delivery-lh-header-title)] text-[color:var(--delivery-dark)]";

/** `/stores` 1단 — `AppStickyHeader` inner 와 동일 max-width */
export const DELIVERY_TIER1_HEADER_INNER_CLASS = APP_MAIN_HEADER_INNER_CLASS;

export const DELIVERY_SUBPAGE_HEADER_SHELL_CLASS = DeliveryTheme.subpageHeader.shell;
export const DELIVERY_SUBPAGE_HEADER_INNER_CLASS = DeliveryTheme.subpageHeader.inner;
export const DELIVERY_SUBPAGE_HEADER_ROW_CLASS = DeliveryTheme.subpageHeader.row;
export const DELIVERY_SUBPAGE_HEADER_TITLE_CLASS = DELIVERY_CONSUMER_HEADER_TITLE_CLASS;
export const DELIVERY_SUBPAGE_HEADER_BACK_BTN_CLASS = DeliveryTheme.subpageHeader.backBtn;
export const DELIVERY_SUBPAGE_HEADER_ACTION_BTN_CLASS = DeliveryTheme.subpageHeader.actionBtn;

/** @deprecated — `DELIVERY_CONSUMER_HEADER_TITLE_CLASS` 와 동일 */
export const DELIVERY_TIER1_SEGMENT_TITLE_CLASS = DELIVERY_CONSUMER_HEADER_TITLE_CLASS;

/** 매장 스크롤 고정 헤더(흰 배경) — `DeliveryConsumerHeaderRow` 제목 슬롯과 동일 */
export const DELIVERY_STORE_STICKY_TITLE_CLASS = DELIVERY_CONSUMER_HEADER_TITLE_IN_SLOT_CLASS;

/** `/stores` 및 하위 소비자 경로 — `sam-primary` → 스타벅스 녹색 브리지 */
export function isDeliveryConsumerPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() || "";
  return p === "/stores" || p.startsWith("/stores/");
}

