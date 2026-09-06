/**
 * Ads operator CTA / state presentation — wraps canonical adminActionAllowed.
 * No new lifecycle. Presentation + vocabulary only.
 */

import {
  adminActionAllowed,
  adminActionRequiresReason,
  type AdminDeliveryAdAction,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";

export type AdsOperatorCta = {
  action: AdminDeliveryAdAction;
  labelKo: string;
  labelEn: string;
  requiresReason: boolean;
};

const ACTION_LABEL: Record<AdminDeliveryAdAction, { ko: string; en: string }> = {
  start_review: { ko: "검토 시작", en: "Start review" },
  request_changes: { ko: "수정 요청", en: "Request changes" },
  approve: { ko: "승인", en: "Approve" },
  reject: { ko: "거절", en: "Reject" },
  pause: { ko: "일시중지", en: "Pause" },
  resume: { ko: "재개", en: "Resume" },
  end: { ko: "종료", en: "End" },
  terminate: { ko: "강제 중단", en: "Force stop" },
  archive: { ko: "보관", en: "Archive" },
  delete_safe_draft: { ko: "초안 삭제", en: "Delete draft" },
};

/** Valid Admin CTAs for a canonical lifecycle status. */
export function adsOperatorCtasForLifecycle(
  lifecycle: DeliveryAdLifecycleStatus
): AdsOperatorCta[] {
  return (Object.keys(ACTION_LABEL) as AdminDeliveryAdAction[])
    .filter((a) => adminActionAllowed(a, lifecycle))
    .map((action) => ({
      action,
      labelKo: ACTION_LABEL[action].ko,
      labelEn: ACTION_LABEL[action].en,
      requiresReason: adminActionRequiresReason(action),
    }));
}

export function adsLifecycleOperatorLabel(
  lifecycle: string | null | undefined,
  ko: boolean
): string {
  const s = String(lifecycle ?? "").trim();
  const map: Record<string, { ko: string; en: string }> = {
    DRAFT: { ko: "임시저장", en: "Draft" },
    SUBMITTED: { ko: "승인 대기", en: "Pending approval" },
    UNDER_REVIEW: { ko: "승인 대기", en: "Pending approval" },
    CHANGES_REQUESTED: { ko: "보류", en: "On hold" },
    APPROVED: { ko: "승인", en: "Approved" },
    SCHEDULED: { ko: "예약", en: "Scheduled" },
    ACTIVE: { ko: "노출 중", en: "Live" },
    PAUSED_OWNER: { ko: "사장님 일시중지", en: "Paused by owner" },
    PAUSED_ADMIN: { ko: "관리자 일시중지", en: "Paused by admin" },
    EXHAUSTED: { ko: "소진", en: "Exhausted" },
    REJECTED: { ko: "반려", en: "Rejected" },
    ENDED: { ko: "종료", en: "Ended" },
    TERMINATED: { ko: "강제 종료", en: "Terminated" },
    ARCHIVED: { ko: "보관됨", en: "Archived" },
  };
  const hit = map[s];
  if (hit) return ko ? hit.ko : hit.en;
  return s || "—";
}

export function adsWhyActionable(
  input: {
    lifecycle: string | null;
    needsCreative: boolean;
    hadChangesRequested: boolean;
  },
  ko: boolean
): string {
  if (input.needsCreative) {
    return ko ? "배너 소재 제작·확인이 필요합니다." : "Banner creative needs production.";
  }
  if (input.lifecycle === "SUBMITTED" || input.lifecycle === "UNDER_REVIEW") {
    return ko
      ? "관리자 심사(승인·수정 요청·거절)가 필요합니다."
      : "Admin review required (approve / request changes / reject).";
  }
  if (input.hadChangesRequested) {
    return ko ? "수정 후 재검토가 필요합니다." : "Re-review after owner changes.";
  }
  return ko ? "관리자 조치가 필요합니다." : "Admin action required.";
}

export function adsRemainingPeriodLabel(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  ko: boolean
): string {
  const end = endAt ? new Date(endAt).getTime() : NaN;
  const start = startAt ? new Date(startAt).getTime() : NaN;
  const now = Date.now();
  if (!Number.isFinite(end)) return "";
  if (Number.isFinite(start) && now < start) {
    const h = Math.max(0, Math.round((start - now) / 3600000));
    if (h < 48) return ko ? `${h}시간 후 시작` : `Starts in ${h}h`;
    const d = Math.ceil(h / 24);
    return ko ? `${d}일 후 시작` : `Starts in ${d}d`;
  }
  const left = end - now;
  if (left <= 0) return ko ? "기간 종료" : "Period ended";
  const h = Math.round(left / 3600000);
  if (h < 48) return ko ? `${h}시간 남음` : `${h}h left`;
  return ko ? `${Math.ceil(h / 24)}일 남음` : `${Math.ceil(h / 24)}d left`;
}

export function adsExposureLabel(
  lifecycle: string | null | undefined,
  ko: boolean
): string {
  const s = String(lifecycle ?? "");
  if (s === "ACTIVE") return ko ? "실제 노출 가능(조건 충족 시)" : "May be exposed if eligible";
  if (s === "SCHEDULED") return ko ? "아직 노출 안 됨(예약)" : "Not exposed yet (scheduled)";
  if (s.startsWith("PAUSED")) return ko ? "노출 중단(일시중지)" : "Exposure paused";
  if (s === "ENDED" || s === "TERMINATED" || s === "ARCHIVED" || s === "REJECTED") {
    return ko ? "노출 종료" : "Not exposed";
  }
  return ko ? "아직 노출 안 됨" : "Not exposed yet";
}

export function adsPaymentLabel(
  fundingStatus: string | null | undefined,
  currency: "CASH" | "POINT" | "UNKNOWN" | "N_A",
  ko: boolean
): string {
  const f = String(fundingStatus ?? "").toUpperCase();
  if (f === "NONE" || f === "ADMIN_DIRECT" || currency === "N_A") {
    return ko ? "결제 없음" : "No payment";
  }
  if (currency === "POINT") {
    return ko ? "Point 결제" : "Point billing";
  }
  if (f === "FUNDED") return ko ? "Business Cash 결제 완료" : "Business Cash funded";
  if (f === "REFUNDED") return ko ? "환불됨" : "Refunded";
  if (currency === "CASH") {
    if (f === "UNFUNDED") return ko ? "Business Cash 결제 대기" : "Business Cash pending";
    if (!f) return ko ? "Business Cash 결제" : "Business Cash billing";
  }
  if (f === "UNFUNDED") return ko ? "결제 대기" : "Payment pending";
  if (!f) return ko ? "결제 정보 없음" : "Payment unavailable";
  return ko ? `결제: ${f}` : `Payment: ${f}`;
}
