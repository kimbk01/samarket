
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * Store order audit log → operator wording (감사 로그 화면 · 주문 상세 처리 이력).
 * Every `store_order.*` action written in app/lib (24, test-locked) plus the action values found in production
 * `audit_logs` are mapped. Unknown actions are shown as 「기타 기록」 with the raw name — never hidden.
 * The raw row (action, before_json, after_json) is kept for the 「원본」 expander; nothing is rewritten.
 */

export type AdminAuditCategory = "admin" | "owner" | "buyer" | "system" | "qa" | "other";

export const ADMIN_AUDIT_CATEGORY_LABEL: Record<AdminAuditCategory, { ko: string; en: string }> = {
  admin: catalogPair("admin_admin"),
  owner: catalogPair("admin_store_3"),
  buyer: catalogPair("admin_r4b_chat_role_buyer"),
  system: catalogPair("admin_system"),
  qa: catalogPair("admin_qa_record"),
  other: catalogPair("admin_menu_bottom_icon_cat_misc"),
};

type Entry = { ko: string; en: string; category: AdminAuditCategory };

/** Keys are the part after `store_order.`. */
export const STORE_ORDER_AUDIT_ACTION_LABEL: Record<string, Entry> = {
  create: { ...catalogPair("admin_order_created_2"), category: "buyer" },
  owner_status: { ...catalogPair("admin_store_status_change"), category: "owner" },
  owner_cancel: { ...catalogPair("admin_store_cancelled_order"), category: "owner" },
  owner_cancel_request: { ...catalogPair("admin_store_cancel_request_legacy"), category: "owner" },
  owner_decision: { ...catalogPair("admin_store_decision"), category: "owner" },
  owner_cancel_request_approve: { ...catalogPair("admin_store_approved_cancel_request"), category: "owner" },
  owner_cancel_request_reject: { ...catalogPair("admin_store_rejected_cancel_request"), category: "owner" },
  owner_refund_approve: { ...catalogPair("admin_store_approved_refund"), category: "owner" },
  owner_refund_reject: { ...catalogPair("admin_store_rejected_refund"), category: "owner" },
  "delivery.owner_patch": { ...catalogPair("admin_store_delivery_update"), category: "owner" },
  "delivery.admin_patch": { ...catalogPair("admin_admin_delivery_update"), category: "admin" },
  mark_paid: { ...catalogPair("admin_admin_marked_as_paid"), category: "admin" },
  "delivery.admin_release": { ...catalogPair("admin_admin_released_rider"), category: "admin" },
  "delivery.admin_reassign": { ...catalogPair("admin_admin_reassigned_rider"), category: "admin" },
  "delivery.admin_mark_failed": { ...catalogPair("admin_admin_marked_delivery_failed"), category: "admin" },
  "delivery.rider_patch": { ...catalogPair("admin_rider_delivery_update"), category: "system" },
  buyer_cancel: { ...catalogPair("admin_buyer_cancelled_order"), category: "buyer" },
  buyer_cancel_request: { ...catalogPair("admin_buyer_cancel_request"), category: "buyer" },
  buyer_refund_request: { ...catalogPair("admin_buyer_refund_request_legacy"), category: "buyer" },
  buyer_hide: { ...catalogPair("admin_buyer_hid_order"), category: "buyer" },
  admin_force_cancel: { ...catalogPair("admin_admin_cancelled_order"), category: "admin" },
  admin_set_refund_requested: { ...catalogPair("admin_admin_opened_refund_request"), category: "admin" },
  admin_approve_cancel_request: { ...catalogPair("admin_admin_approved_cancel_request"), category: "admin" },
  admin_reject_cancel_request: { ...catalogPair("admin_admin_rejected_cancel_request"), category: "admin" },
  admin_complete_refund: { ...catalogPair("admin_admin_completed_refund"), category: "admin" },
  admin_reject_refund: { ...catalogPair("admin_admin_rejected_refund"), category: "admin" },
  admin_patch_meta: { ...catalogPair("admin_admin_updated_note_lock"), category: "admin" },
  admin_intervention: { ...catalogPair("admin_admin_intervention"), category: "admin" },
  cron_auto_complete: { ...catalogPair("admin_auto_completed"), category: "system" },
  cron_accept_timeout_cancel: { ...catalogPair("admin_auto_cancelled_not_accepted"), category: "system" },
  external_delivery_webhook: { ...catalogPair("admin_external_delivery_update"), category: "system" },
  delivery_sync_arrived: { ...catalogPair("admin_delivered_order_arrived"), category: "system" },
  payment_failed_cancel: { ...catalogPair("admin_cancelled_after_payment_failure"), category: "system" },
  stock_restore_failed: { ...catalogPair("admin_stock_restore_failed_warning"), category: "system" },
};

/** QA script records found in production (`fin_ssot_*`, `phase_d_*`) — separated, never deleted. */
export function isQaAuditAction(action: string): boolean {
  return /^(fin_ssot_|phase_d_)/.test(action);
}

export type AdminAuditView = {
  label: string;
  category: AdminAuditCategory;
  known: boolean;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function describeStoreOrderAudit(
  row: { action: string; actor_type?: string | null; before_json?: unknown; after_json?: unknown },
  ko: boolean
): AdminAuditView {
  const action = String(row.action ?? "");
  const before = obj(row.before_json);
  const after = obj(row.after_json);
  const fromStatus = strOrNull(before.order_status) ?? strOrNull(before.status);
  const toStatus = strOrNull(after.order_status) ?? strOrNull(after.status) ?? strOrNull(after.next_status);
  const reason = strOrNull(after.reason) ?? strOrNull(after.rejected_reason) ?? strOrNull(after.cancel_reason);

  if (isQaAuditAction(action)) {
    return { label: tx(ko, "admin_store_orders_qa_record", { action: String(action) }), category: "qa", known: true, fromStatus, toStatus, reason };
  }
  const key = action.startsWith("store_order.") ? action.slice("store_order.".length) : action;
  const entry = STORE_ORDER_AUDIT_ACTION_LABEL[key];
  if (entry) return { label: ko ? entry.ko : entry.en, category: entry.category, known: true, fromStatus, toStatus, reason };
  // Unmapped actions are always 「기타」 (the actor is not guessed), so the logs page category
  // filter (`storeOrderAuditCategoryActions`) and this label agree.
  return { label: tx(ko, "admin_store_orders_other", { action: String(action) }), category: "other", known: false, fromStatus, toStatus, reason };
}

/** Full `audit_logs.action` values per category (the logs page filters server-side with these). */
export function storeOrderAuditCategoryActions(category: Exclude<AdminAuditCategory, "qa" | "other">): string[] {
  return Object.entries(STORE_ORDER_AUDIT_ACTION_LABEL)
    .filter(([, e]) => e.category === category)
    .map(([k]) => `store_order.${k}`);
}

export const STORE_ORDER_AUDIT_KNOWN_ACTIONS: readonly string[] = Object.keys(STORE_ORDER_AUDIT_ACTION_LABEL).map((k) => `store_order.${k}`);
