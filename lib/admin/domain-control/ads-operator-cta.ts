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
import { formatAdsRemaining } from "@/lib/admin/ads-exposure/canonical-location-period";
import { catalogPair } from "@/lib/i18n/catalog-pair";

export type AdsOperatorCta = {
  action: AdminDeliveryAdAction;
  labelKo: string;
  labelEn: string;
  requiresReason: boolean;
};

const ACTION_LABEL: Record<AdminDeliveryAdAction, { ko: string; en: string }> = {
  start_review: catalogPair("admin_meeting_reports_action_start_review"),
  request_changes: catalogPair("admin_request_changes"),
  approve: catalogPair("admin_meeting_engine_action_approve"),
  reject: catalogPair("admin_meeting_engine_action_reject"),
  pause: catalogPair("admin_pause"),
  resume: catalogPair("admin_resume"),
  end: catalogPair("admin_end"),
  terminate: catalogPair("admin_force_stop"),
  archive: catalogPair("admin_archive"),
  delete_safe_draft: catalogPair("admin_delivery_ads_action_delete_safe_draft"),
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
    DRAFT: catalogPair("admin_notif_status_draft"),
    SUBMITTED: catalogPair("admin_del_alert_filter_pending_approval"),
    UNDER_REVIEW: catalogPair("admin_del_alert_filter_pending_approval"),
    CHANGES_REQUESTED: catalogPair("admin_on_hold"),
    APPROVED: catalogPair("admin_approved"),
    SCHEDULED: catalogPair("admin_scheduled"),
    ACTIVE: catalogPair("admin_live"),
    PAUSED_OWNER: catalogPair("admin_paused_by_owner"),
    PAUSED_ADMIN: catalogPair("admin_paused_by_admin"),
    EXHAUSTED: catalogPair("admin_delivery_ads_lifecycle_exhausted"),
    REJECTED: catalogPair("admin_rejected"),
    ENDED: catalogPair("admin_ended"),
    TERMINATED: catalogPair("admin_delivery_ads_lifecycle_terminated"),
    ARCHIVED: catalogPair("admin_chat_r1b_status_archived"),
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
      ? "관리자 심사(승인·수정 요청·반려)가 필요합니다."
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
  return formatAdsRemaining(startAt, endAt, Date.now(), ko).label;
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
