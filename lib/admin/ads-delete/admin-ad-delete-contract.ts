/**
 * 어드민 광고 삭제·삭제 취소 계약 (설계 §3-2 · R2 · 2026-11-07) — API·화면 공용 순수 함수. Client-safe.
 * DB: `admin_ad_delete` / `admin_ad_undelete` (마이그레이션 `20271107210001_ads_admin_delete_soft_delete.sql`).
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAdDeleteKind } from "@/lib/admin/access/admin-ads-authority";

export type AdminAdDeleteMode = "hard" | "soft" | "end_and_soft";
export type AdminAdRefundUnit = "point" | "business_cash" | "none";
/** 화면 귀책 선택 — DB 가 종료 함수마다 맞는 값(member·owner)으로 바꾼다. */
export type AdminAdDeleteFault = "operator" | "advertiser";

export type AdminAdDeletePlan = {
  mode: AdminAdDeleteMode;
  refundAmount: number;
  paidAmount: number;
  refundUnit: AdminAdRefundUnit;
  needsFault: boolean;
};

export type AdminAdDeletedRow = {
  kind: AdminAdDeleteKind;
  id: string;
  title: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;
};

const MODES = new Set<string>(["hard", "soft", "end_and_soft"]);
const UNITS = new Set<string>(["point", "business_cash", "none"]);

/** DB 응답(jsonb) → 계획. 모르는 값은 안전한 쪽(soft·none)으로. */
export function parseAdminAdDeletePlan(raw: unknown): AdminAdDeletePlan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mode = typeof r.mode === "string" && MODES.has(r.mode) ? (r.mode as AdminAdDeleteMode) : "soft";
  const unit =
    typeof r.refund_unit === "string" && UNITS.has(r.refund_unit) ? (r.refund_unit as AdminAdRefundUnit) : "none";
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    mode,
    refundAmount: num(r.refund_amount),
    paidAmount: num(r.paid_amount),
    refundUnit: unit,
    needsFault: r.needs_fault === true,
  };
}

/** DB·API 오류 코드 → HTTP 상태. */
export function adminAdDeleteErrorStatus(code: string): number {
  switch (code) {
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "already_deleted":
    case "not_deleted":
    case "payment_held":
    case "popup_paid_running":
    case "intro_draft_use_editor":
    case "end_failed":
    case "stale_state":
      return 409;
    case "reason_required":
    case "fault_required":
    case "invalid_kind":
    case "invalid_fault":
    case "invalid_id":
    case "invalid_json":
    case "kind_mismatch":
      return 400;
    default:
      return 500;
  }
}

/** 오류 코드 → 화면 문구 키 (원문·코드값을 보이지 않는다). */
export function adminAdDeleteErrorMessageKey(code: string | null | undefined): MessageKey {
  switch (code) {
    case "reason_required":
      return "admin_ad_delete_err_reason_required";
    case "forbidden":
    case "forbidden_permission":
    case "admin_only":
    case "admin_actor_suspended":
      return "admin_ad_delete_err_forbidden";
    case "invalid_kind":
    case "invalid_fault":
    case "invalid_id":
    case "invalid_json":
    case "kind_mismatch":
      return "admin_ad_delete_err_invalid";
    case "not_found":
      return "admin_ad_delete_err_not_found";
    case "already_deleted":
      return "admin_ad_delete_err_already_deleted";
    case "not_deleted":
      return "admin_ad_delete_err_not_deleted";
    case "fault_required":
      return "admin_ad_delete_err_fault_required";
    case "payment_held":
      return "admin_ad_delete_err_payment_held";
    case "popup_paid_running":
      return "admin_ad_delete_err_popup_paid_running";
    case "intro_draft_use_editor":
      return "admin_ad_delete_err_intro_draft";
    case "end_failed":
      return "admin_ad_delete_err_end_failed";
    case "stale_state":
      return "admin_ad_delete_err_stale";
    default:
      return "admin_ad_delete_err_failed";
  }
}

/** 광고 종류 → 종류 이름 문구 키. */
export function adminAdKindLabelKey(kind: AdminAdDeleteKind): MessageKey {
  return `admin_ad_kind_${kind}` as MessageKey;
}
