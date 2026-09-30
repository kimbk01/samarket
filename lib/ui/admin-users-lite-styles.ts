/** Admin 회원관리 Legacy Lite — bridges to R1 Member Admin CTA hierarchy */

import { MEMBER_ADMIN_CTA_CLASS } from "@/lib/admin-users/member-admin-visual-ssot";

export const ADMIN_USERS_LITE_PAGE_BG = "bg-[#f4f6f9]";

export const ADMIN_USERS_LITE_CARD =
  "rounded-xl border border-[#e4e7ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]";

export const ADMIN_USERS_LITE_PRIMARY = "#2563eb";

/** PRIMARY — one main action per surface (filled brand). */
export const ADMIN_USERS_LITE_BTN_PRIMARY = MEMBER_ADMIN_CTA_CLASS.primary;

/**
 * @deprecated Equal-weight blue outline caused Owner rejection.
 * Prefer ADMIN_USERS_LITE_BTN_SECONDARY / TERTIARY. Kept as alias to secondary for safe migration.
 */
export const ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY = MEMBER_ADMIN_CTA_CLASS.secondary;

export const ADMIN_USERS_LITE_BTN_SECONDARY = MEMBER_ADMIN_CTA_CLASS.secondary;

export const ADMIN_USERS_LITE_BTN_TERTIARY = MEMBER_ADMIN_CTA_CLASS.tertiary;

export const ADMIN_USERS_LITE_BTN_OUTLINE_DANGER = MEMBER_ADMIN_CTA_CLASS.danger;

export const ADMIN_USERS_LITE_BTN_DANGER = MEMBER_ADMIN_CTA_CLASS.danger;

export const ADMIN_USERS_LITE_TABLE_ACTION = MEMBER_ADMIN_CTA_CLASS.tertiary;
