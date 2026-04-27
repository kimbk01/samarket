/**
 * 대시보드 상태 키 → i18n MessageKey (표시는 `t(labelKey)`).
 */

import type { MessageKey } from "@/lib/i18n/messages";

export const PRODUCT_STATUS_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  active: "admin_dashboard_product_active",
  reserved: "admin_dashboard_product_reserved",
  sold: "admin_dashboard_product_sold",
  hidden: "admin_dashboard_product_hidden",
  blinded: "admin_dashboard_product_blinded",
  deleted: "admin_dashboard_product_deleted",
};

export const USER_STATUS_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  active: "admin_dashboard_user_active",
  warned: "admin_dashboard_user_warned",
  suspended: "admin_dashboard_user_suspended",
  banned: "admin_dashboard_user_banned",
  premium: "admin_dashboard_user_premium",
  admin: "admin_dashboard_user_admin",
};

export const REPORT_STATUS_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  pending: "admin_dashboard_report_pending",
  reviewed: "admin_dashboard_report_reviewed",
  rejected: "admin_dashboard_report_rejected",
};

export const CHAT_STATUS_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  active: "admin_dashboard_chat_active",
  blocked: "admin_dashboard_chat_blocked",
  reported: "admin_dashboard_chat_reported",
  archived: "admin_dashboard_chat_archived",
};

export const DATE_RANGE_OPTIONS: readonly { value: string; labelKey: MessageKey }[] = [
  { value: "7", labelKey: "admin_dashboard_range_7" },
  { value: "14", labelKey: "admin_dashboard_range_14" },
  { value: "30", labelKey: "admin_dashboard_range_30" },
];
