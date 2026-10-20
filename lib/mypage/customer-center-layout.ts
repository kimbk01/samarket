/**
 * App Customer Center Slice 2 — role-based content columns.
 * Reuses APP_MAIN column chain; does NOT invent a second max-width ladder.
 * DO NOT: force one max-w-lg on every CS surface.
 */

import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_FEED_STACK_CLASS,
} from "@/lib/ui/app-content-layout";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/**
 * 회원 문의함·문의 목록 — 내정보 본문 1열 (폰 16px · 768+ 20px · 최대 640px, 설계서 v3 §2).
 * 거터는 이 클래스 한 번만 (`CUSTOMER_CENTER_SCROLL_BODY_CLASS` 는 가로 여백 없음).
 */
export const CUSTOMER_CENTER_LIST_COLUMN_CLASS = `${MYPAGE_BODY_COLUMN_CLASS} flex flex-col gap-3 py-3`;

/** 문의 상세·포인트 충전 폼 — 같은 내정보 본문 1열 */
export const CUSTOMER_CENTER_FORM_COLUMN_CLASS = MYPAGE_BODY_COLUMN_CLASS;

/** Notice / terms reading — fluid on tablet, capped on large desktop. */
export const CUSTOMER_CENTER_READING_COLUMN_CLASS = `mx-auto w-full min-w-0 max-w-full px-3 sm:max-w-2xl sm:px-4 md:max-w-3xl lg:max-w-4xl`;

/** Desktop/tablet outer shell for CS full pages (header + scroll). Tint via CC_PAGE_BG_CLASS. */
export const CUSTOMER_CENTER_PAGE_SHELL_CLASS =
  "flex min-h-screen min-w-0 flex-col overflow-x-clip";

/** Scroll body under MySubpageHeader — 가로 여백 없음 (거터는 안쪽 내정보 열이 단독 소유). */
export const CUSTOMER_CENTER_SCROLL_BODY_CLASS = MYPAGE_SCROLL_BODY_CLASS;

/** Alias: keep list pages aligned with main feed gutters. */
export const CUSTOMER_CENTER_DESKTOP_SHELL_CLASS = `${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_FEED_STACK_CLASS}`;
