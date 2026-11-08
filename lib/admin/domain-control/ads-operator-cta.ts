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
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
    return tx(ko, "admin_domain_control_banner_creative_needs_production");
  }
  if (input.lifecycle === "SUBMITTED" || input.lifecycle === "UNDER_REVIEW") {
    return tx(ko, "admin_domain_control_admin_review_required_approve_request_changes");
  }
  if (input.hadChangesRequested) {
    return tx(ko, "admin_domain_control_re_review_after_owner_changes");
  }
  return tx(ko, "admin_domain_control_admin_action_required");
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
  if (s === "ACTIVE") return tx(ko, "admin_domain_control_may_be_exposed_if_eligible");
  if (s === "SCHEDULED") return tx(ko, "admin_domain_control_not_exposed_yet_scheduled");
  if (s.startsWith("PAUSED")) return tx(ko, "admin_domain_control_exposure_paused");
  if (s === "ENDED" || s === "TERMINATED" || s === "ARCHIVED" || s === "REJECTED") {
    return tx(ko, "admin_domain_control_not_exposed");
  }
  return tx(ko, "admin_ads_operator_not_exposed_yet");
}

export function adsPaymentLabel(
  fundingStatus: string | null | undefined,
  currency: "CASH" | "POINT" | "UNKNOWN" | "N_A",
  ko: boolean
): string {
  const f = String(fundingStatus ?? "").toUpperCase();
  if (f === "NONE" || f === "ADMIN_DIRECT" || currency === "N_A") {
    return tx(ko, "admin_domain_control_no_payment");
  }
  if (currency === "POINT") {
    return tx(ko, "admin_domain_control_point_billing");
  }
  if (f === "FUNDED") return tx(ko, "admin_domain_control_business_cash_funded");
  if (f === "REFUNDED") return tx(ko, "admin_domain_control_refunded");
  if (currency === "CASH") {
    if (f === "UNFUNDED") return tx(ko, "admin_domain_control_business_cash_pending");
    if (!f) return tx(ko, "admin_domain_control_business_cash_billing");
  }
  if (f === "UNFUNDED") return tx(ko, "admin_domain_control_payment_pending");
  if (!f) return tx(ko, "admin_domain_control_payment_unavailable");
  return tx(ko, "admin_domain_control_payment", { state: String(f) });
}
