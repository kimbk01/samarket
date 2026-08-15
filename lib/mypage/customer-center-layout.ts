/**
 * App Customer Center Slice 2 — role-based content columns.
 * Reuses APP_MAIN column chain; does NOT invent a second max-width ladder.
 * DO NOT: force one max-w-lg on every CS surface.
 */

import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_FEED_STACK_CLASS,
  APP_MAIN_GUTTER_X_COMFY_CLASS,
  APP_MAIN_TAB_SCROLL_BODY_CLASS,
} from "@/lib/ui/app-content-layout";

/** Hub / list / shortcut rows — full main column (phone → tablet → desktop). */
export const CUSTOMER_CENTER_LIST_COLUMN_CLASS =
  "mx-auto w-full min-w-0 max-w-full flex flex-col gap-3 py-3 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl";

/** Inquiry / charge forms — readable form width inside main column. */
export const CUSTOMER_CENTER_FORM_COLUMN_CLASS = `mx-auto w-full min-w-0 max-w-[36rem] md:max-w-[40rem] ${APP_MAIN_GUTTER_X_COMFY_CLASS}`;

/** Notice / terms reading — fluid on tablet, capped on large desktop. */
export const CUSTOMER_CENTER_READING_COLUMN_CLASS = `mx-auto w-full min-w-0 max-w-full px-3 sm:max-w-2xl sm:px-4 md:max-w-3xl lg:max-w-4xl`;

/** Desktop/tablet outer shell for CS full pages (header + scroll). Tint via CC_PAGE_BG_CLASS. */
export const CUSTOMER_CENTER_PAGE_SHELL_CLASS =
  "flex min-h-screen min-w-0 flex-col overflow-x-clip";

/** Scroll body under MySubpageHeader — same token as mypage stack. */
export const CUSTOMER_CENTER_SCROLL_BODY_CLASS = APP_MAIN_TAB_SCROLL_BODY_CLASS;

/** Alias: keep list pages aligned with main feed gutters. */
export const CUSTOMER_CENTER_DESKTOP_SHELL_CLASS = `${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_FEED_STACK_CLASS}`;
