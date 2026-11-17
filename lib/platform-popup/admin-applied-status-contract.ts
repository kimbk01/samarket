/**
 * v3 ④ (앱 진입 어드민 §6 · Owner 2026-11-17 「v3대로 진행」) — 팝업 「앱에 나오나」 결과 모양 · 문구 키 (순수 · 화면 공용).
 * 계산은 서버 한 곳: `lib/platform-popup/admin-applied-status.ts` (앱 조회와 같은 자격 함수).
 *
 * - live: 앱에 나오는 중(회원별 숨김·하루 1번 등 사람마다 다른 것은 보지 않음)
 * - conditional: 조건이 맞는 회원·화면에서만 나옴(쿠폰 카드 · 홈이 없는 위치의 말풍선)
 * - scheduled: 시작 시각 전 — 다른 조건은 모두 통과
 * - not_shown: 안 나옴 — 첫 이유 1줄
 */
import type { MessageKey } from "@/lib/i18n/message-key";
import type { PlatformPopupCandidateGateReason } from "@/lib/platform-popup/resolve-popup-ad";

export const PLATFORM_POPUP_APPLIED_STATES = ["live", "conditional", "scheduled", "not_shown"] as const;
export type PlatformPopupAppliedState = (typeof PLATFORM_POPUP_APPLIED_STATES)[number];

export type PlatformPopupAppliedReason =
  | PlatformPopupCandidateGateReason
  | "policy_disabled"
  | "approval_pending"
  | "approval_rejected"
  | "status_draft"
  | "status_approved_idle"
  | "status_paused"
  | "status_ended"
  | "benefit_content_required"
  | "presentation_invalid"
  | "list_stores_empty"
  | "coupon_members_only"
  | "tooltip_home_only"
  | "starts_at";

export type PlatformPopupAppliedStatus = {
  state: PlatformPopupAppliedState;
  /** 안 나옴·조건부·예약의 첫 이유 (나오는 중 = null) */
  reason: PlatformPopupAppliedReason | null;
  /** 예약 — 시작 시각(ISO) */
  startsAt?: string | null;
  /** 이동 대상 검사 오류 코드(`cta.ts`) — reason=cta_invalid 일 때 */
  ctaError?: string | null;
};

/** 목록 필터 — 「앱에 나오는 중」(나오는 중 + 조건부) · 「안 나옴」 */
export const PLATFORM_POPUP_APPLIED_LIVE_FILTER = "live" as const;
export const PLATFORM_POPUP_APPLIED_NOT_SHOWN_FILTER = "not_shown" as const;

export function isPlatformPopupAppliedShowing(state: PlatformPopupAppliedState): boolean {
  return state === "live" || state === "conditional";
}

export function platformPopupAppliedStateKey(state: PlatformPopupAppliedState): MessageKey {
  return `admin_popup_applied_state_${state}` as MessageKey;
}

/** 이동 대상 오류는 종류별로 나눠 보인다(삭제됨·비공개·기간 끝남) */
export function platformPopupAppliedReasonKey(status: PlatformPopupAppliedStatus): MessageKey | null {
  if (!status.reason) return null;
  if (status.reason === "cta_invalid") {
    const e = String(status.ctaError ?? "");
    if (e === "target_deleted") return "admin_popup_applied_reason_cta_deleted" as MessageKey;
    if (e === "target_hidden") return "admin_popup_applied_reason_cta_hidden" as MessageKey;
    if (e === "target_expired") return "admin_popup_applied_reason_cta_expired" as MessageKey;
    return "admin_popup_applied_reason_cta_invalid" as MessageKey;
  }
  return `admin_popup_applied_reason_${status.reason}` as MessageKey;
}

export type PlatformPopupAppliedTone = "success" | "warning" | "waiting" | "danger";

export function platformPopupAppliedTone(state: PlatformPopupAppliedState): PlatformPopupAppliedTone {
  if (state === "live") return "success";
  if (state === "conditional") return "warning";
  if (state === "scheduled") return "waiting";
  return "danger";
}

/**
 * 운영 상태 배지(노출 중·예약·정지·종료·초안) — 서버 「앱에 나오나」에서만 만든다(목록·상세 같은 결과).
 * 예전에는 화면이 상태·날짜만 보고 따로 계산해 「노출 중」인데 앱에는 안 나오는 일이 있었다.
 */
export type PlatformPopupAppliedOperatorStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED";

export function platformPopupAppliedOperatorStatus(status: PlatformPopupAppliedStatus): PlatformPopupAppliedOperatorStatus {
  if (status.state === "live" || status.state === "conditional") return "ACTIVE";
  if (status.state === "scheduled") return "SCHEDULED";
  if (status.reason === "status_paused") return "PAUSED";
  if (status.reason === "status_ended" || status.reason === "schedule_ended") return "ENDED";
  return "DRAFT";
}

/** 후보(승인·노출/예약 상태)가 아닌 캠페인 — 행의 승인·상태만으로 첫 이유 */
export function platformPopupAppliedStatusFromRow(row: {
  status: string;
  approvalStatus: string;
  policyEnabled: boolean;
}): PlatformPopupAppliedStatus {
  if (!row.policyEnabled) return { state: "not_shown", reason: "policy_disabled" };
  const approval = String(row.approvalStatus ?? "");
  const status = String(row.status ?? "");
  if (approval === "rejected" || status === "rejected") return { state: "not_shown", reason: "approval_rejected" };
  if (status === "ended") return { state: "not_shown", reason: "status_ended" };
  if (status === "paused") return { state: "not_shown", reason: "status_paused" };
  if (approval === "pending_review" || status === "pending_review") {
    return { state: "not_shown", reason: "approval_pending" };
  }
  if (status === "draft") return { state: "not_shown", reason: "status_draft" };
  if (approval !== "approved") return { state: "not_shown", reason: "not_approved" };
  if (status === "approved") return { state: "not_shown", reason: "status_approved_idle" };
  return { state: "not_shown", reason: "status_inactive" };
}
