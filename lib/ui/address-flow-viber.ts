/**
 * 주소 목록·위치 선택·시트 공통 클래스 — `Sam` 토큰과 맞춤.
 * 가로 폭은 `APP_MAIN_COLUMN_MAX_WIDTH_CLASS`와 동일 체인으로 메인 앱 본문과 정렬.
 */

import {
  APP_MAIN_COLUMN_MAX_WIDTH_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

/** 전체 플로우 루트 — 노치·가로 스크롤 방지 */
export const ADDR_FLOW_MIN_VIEWPORT =
  "flex min-h-0 min-h-[100dvh] w-full min-w-0 max-w-[100dvw] flex-1 flex-col overflow-x-clip bg-sam-app";

/** 주소 설정·지도 하단 패널과 동일한 읽기 폭(모바일~가로 태블릿) */
export const ADDR_CONTENT_COLUMN = `mx-auto w-full min-w-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

export const ADDR_LIST_CARD =
  "rounded-ui-rect border border-sam-primary-border/40 bg-sam-surface shadow-sm";

export const ADDR_ADD_CTA =
  "w-full rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft/35 py-3.5 sam-text-body font-semibold text-signature shadow-sm transition-colors hover:bg-sam-primary-soft";

export const ADDR_ROW_TITLE = "sam-text-body font-semibold text-signature/95";

export const ADDR_BODY = "leading-snug text-sam-muted";

export const ADDR_SEARCH_WRAP =
  "flex w-full items-center gap-2 rounded-ui-rect border border-sam-primary-border/70 bg-white px-3 py-2 shadow-sm";

export const ADDR_SEARCH_INPUT =
  "min-w-0 flex-1 border-0 bg-transparent py-1.5 sam-text-body text-sam-fg outline-none placeholder:text-sam-meta";

export const ADDR_SECTION_LABEL =
  "mb-2 sam-text-helper font-semibold uppercase tracking-wide text-signature/80";

export const ADDR_SETTINGS_BODY = `shrink-0 space-y-3 bg-sam-app py-4 ${ADDR_CONTENT_COLUMN}`;

export const ADDR_MAP_HOST = "relative min-h-0 flex-1 bg-sam-surface-muted";

export const ADDR_BOTTOM_BAR = "shrink-0 border-t border-sam-primary-border/50 bg-sam-surface safe-area-pb";

export const ADDR_BOTTOM_INNER = `flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${ADDR_CONTENT_COLUMN}`;

export const ADDR_BODY_STRONG = "sam-text-body font-medium text-sam-fg";

export const ADDR_LIST_ROW_BTN =
  "min-w-0 flex-1 rounded-ui-rect border border-transparent px-2 py-3 text-left sam-text-body text-sam-fg hover:border-sam-primary-border/60 hover:bg-sam-primary-soft/35";

export const ADDR_BTN_PRIMARY_FULL =
  "w-full rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-40";

export const ADDR_BTN_SECONDARY_FULL =
  "w-full rounded-ui-rect border border-sam-primary-border bg-white py-3.5 sam-text-body font-semibold text-signature shadow-sm transition-colors hover:bg-sam-primary-soft/50";

export const ADDR_BTN_TERTIARY_FULL =
  "sam-text-body-secondary font-medium text-sam-meta underline-offset-2 hover:text-signature hover:underline";
