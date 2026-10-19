/**
 * Store order audit log → operator wording (감사 로그 화면 · 주문 상세 처리 이력).
 * Every `store_order.*` action written in app/lib (24, test-locked) plus the action values found in production
 * `audit_logs` are mapped. Unknown actions are shown as 「기타 기록」 with the raw name — never hidden.
 * The raw row (action, before_json, after_json) is kept for the 「원본」 expander; nothing is rewritten.
 */

export type AdminAuditCategory = "admin" | "owner" | "buyer" | "system" | "qa" | "other";

export const ADMIN_AUDIT_CATEGORY_LABEL: Record<AdminAuditCategory, { ko: string; en: string }> = {
  admin: { ko: "관리자", en: "Admin" },
  owner: { ko: "매장", en: "Store" },
  buyer: { ko: "구매자", en: "Buyer" },
  system: { ko: "시스템", en: "System" },
  qa: { ko: "QA 검증 기록", en: "QA record" },
  other: { ko: "기타", en: "Other" },
};

type Entry = { ko: string; en: string; category: AdminAuditCategory };

/** Keys are the part after `store_order.`. */
export const STORE_ORDER_AUDIT_ACTION_LABEL: Record<string, Entry> = {
  create: { ko: "주문 생성", en: "Order created", category: "buyer" },
  owner_status: { ko: "매장 상태 변경", en: "Store status change", category: "owner" },
  owner_cancel: { ko: "매장 주문 취소", en: "Store cancelled order", category: "owner" },
  owner_cancel_request: { ko: "매장 취소 요청 (3단계 이전 경로)", en: "Store cancel request (legacy)", category: "owner" },
  owner_decision: { ko: "매장 결정", en: "Store decision", category: "owner" },
  owner_cancel_request_approve: { ko: "매장 취소요청 승인", en: "Store approved cancel request", category: "owner" },
  owner_cancel_request_reject: { ko: "매장 취소요청 반려", en: "Store rejected cancel request", category: "owner" },
  owner_refund_approve: { ko: "매장 환불 승인", en: "Store approved refund", category: "owner" },
  owner_refund_reject: { ko: "매장 환불 반려", en: "Store rejected refund", category: "owner" },
  "delivery.owner_patch": { ko: "매장 배달 상태 변경", en: "Store delivery update", category: "owner" },
  "delivery.admin_patch": { ko: "관리자 배달 상태 변경", en: "Admin delivery update", category: "admin" },
  "delivery.admin_release": { ko: "관리자 배정 해제", en: "Admin released rider", category: "admin" },
  "delivery.admin_reassign": { ko: "관리자 라이더 재배정", en: "Admin reassigned rider", category: "admin" },
  "delivery.admin_mark_failed": { ko: "관리자 배달 실패 처리", en: "Admin marked delivery failed", category: "admin" },
  "delivery.rider_patch": { ko: "라이더 배달 상태 변경", en: "Rider delivery update", category: "system" },
  buyer_cancel: { ko: "구매자 주문 취소", en: "Buyer cancelled order", category: "buyer" },
  buyer_cancel_request: { ko: "구매자 취소 요청", en: "Buyer cancel request", category: "buyer" },
  buyer_refund_request: { ko: "구매자 환불 요청 (3단계 이전 경로)", en: "Buyer refund request (legacy)", category: "buyer" },
  buyer_hide: { ko: "구매자 주문 숨김", en: "Buyer hid order", category: "buyer" },
  admin_force_cancel: { ko: "관리자 주문 취소", en: "Admin cancelled order", category: "admin" },
  admin_set_refund_requested: { ko: "관리자 환불 요청 등록", en: "Admin opened refund request", category: "admin" },
  admin_reject_cancel_request: { ko: "관리자 취소요청 반려", en: "Admin rejected cancel request", category: "admin" },
  admin_complete_refund: { ko: "관리자 환불 완료", en: "Admin completed refund", category: "admin" },
  admin_reject_refund: { ko: "관리자 환불 반려", en: "Admin rejected refund", category: "admin" },
  admin_patch_meta: { ko: "관리자 메모·잠금 변경", en: "Admin updated note/lock", category: "admin" },
  admin_intervention: { ko: "관리자 예외 개입", en: "Admin intervention", category: "admin" },
  cron_auto_complete: { ko: "자동 완료", en: "Auto-completed", category: "system" },
  external_delivery_webhook: { ko: "외부 배달사 상태 반영", en: "External delivery update", category: "system" },
  payment_failed_cancel: { ko: "결제 실패 자동 취소", en: "Cancelled after payment failure", category: "system" },
  stock_restore_failed: { ko: "재고 복원 실패 (시스템 경고)", en: "Stock restore failed (warning)", category: "system" },
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
    return { label: ko ? `QA 검증 기록 (${action})` : `QA record (${action})`, category: "qa", known: true, fromStatus, toStatus, reason };
  }
  const key = action.startsWith("store_order.") ? action.slice("store_order.".length) : action;
  const entry = STORE_ORDER_AUDIT_ACTION_LABEL[key];
  if (entry) return { label: ko ? entry.ko : entry.en, category: entry.category, known: true, fromStatus, toStatus, reason };
  // Unmapped actions are always 「기타」 (the actor is not guessed), so the logs page category
  // filter (`storeOrderAuditCategoryActions`) and this label agree.
  return { label: ko ? `기타 기록 (${action})` : `Other (${action})`, category: "other", known: false, fromStatus, toStatus, reason };
}

/** Full `audit_logs.action` values per category (the logs page filters server-side with these). */
export function storeOrderAuditCategoryActions(category: Exclude<AdminAuditCategory, "qa" | "other">): string[] {
  return Object.entries(STORE_ORDER_AUDIT_ACTION_LABEL)
    .filter(([, e]) => e.category === category)
    .map(([k]) => `store_order.${k}`);
}

export const STORE_ORDER_AUDIT_KNOWN_ACTIONS: readonly string[] = Object.keys(STORE_ORDER_AUDIT_ACTION_LABEL).map((k) => `store_order.${k}`);
