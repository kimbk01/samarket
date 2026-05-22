/**
 * 배달 소비자 화면 — 상단 바·페이지 배경 단일 계약 (배민 구조 + 스타벅스 팔레트).
 *
 * | 화면 | 바 높이 | 제목 위치 | 제목 타이포 |
 * | `/stores` 1단 | 48px | 좌측 「배달」 | 17px / 700 / `#1e3932` |
 * | 장바구니 등 뒤로가기 | 48px | 가운데 | 동일 |
 * | 매장 상세 스크롤 고정 | 48px | 가운데 매장명 | 동일 |
 */

import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

/** 페이지 본문 — #f6f6f6, 카드·헤더 바는 흰색 */
export const DELIVERY_PAGE_SURFACE_CLASS = DeliveryTheme.page;

/** 모든 소비자 배달 헤더 바 — 흰 배경·하단 1px */
export const DELIVERY_CONSUMER_HEADER_BAR_CLASS =
  "w-full min-w-0 shrink-0 border-b border-[color:var(--delivery-header-bar-border)] bg-[color:var(--delivery-header-bar-bg)]";

/** 48px 한 줄 (max-width·좌우 패딩 통일) */
export const DELIVERY_CONSUMER_HEADER_ROW_CLASS = [
  "mx-auto flex h-[length:var(--delivery-header-h)] min-h-[length:var(--delivery-header-h)] w-full max-w-[42rem] items-center",
  "px-[length:var(--delivery-page-x)]",
].join(" ");

/** 1단·서브·매장 고정 공통 제목 */
export const DELIVERY_CONSUMER_HEADER_TITLE_CLASS =
  "m-0 truncate text-[length:var(--delivery-fs-header-title)] font-bold leading-[var(--delivery-lh-header-title)] text-[color:var(--delivery-dark)]";

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

/** 매장 스크롤 고정 헤더(흰 배경) 중앙 매장명 */
export const DELIVERY_STORE_STICKY_TITLE_CLASS = DELIVERY_CONSUMER_HEADER_TITLE_CLASS;

/** `/stores` 및 하위 소비자 경로 — `sam-primary` → 스타벅스 녹색 브리지 */
export function isDeliveryConsumerPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() || "";
  return p === "/stores" || p.startsWith("/stores/");
}
