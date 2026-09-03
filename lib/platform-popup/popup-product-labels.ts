/**
 * Human product labels for Platform Popup Admin/Owner status UX.
 * Raw enums stay in DB; UI must not show them as primary copy.
 */

import type { PlatformPopupCampaignStatus } from "@/lib/platform-popup/types";
import type {
  PlatformPopupOwnerPaymentStatus,
  PlatformPopupOwnerRequestStatus,
} from "@/lib/platform-popup/owner-request-types";

export function platformPopupOwnerRequestStatusLabel(
  status: PlatformPopupOwnerRequestStatus,
  lang: "ko" | "en"
): string {
  const ko: Record<PlatformPopupOwnerRequestStatus, string> = {
    draft: "작성 중",
    submitted: "검토 대기",
    under_review: "검토 중",
    revision_required: "수정 요청",
    approved: "승인",
    rejected: "반려",
    cancelled: "취소됨",
  };
  const en: Record<PlatformPopupOwnerRequestStatus, string> = {
    draft: "Draft",
    submitted: "Pending review",
    under_review: "Under review",
    revision_required: "Revision required",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return (lang === "en" ? en : ko)[status] ?? status;
}

export function platformPopupOwnerPaymentStatusLabel(
  status: PlatformPopupOwnerPaymentStatus,
  lang: "ko" | "en"
): string {
  const ko: Record<PlatformPopupOwnerPaymentStatus, string> = {
    unfunded: "미결제",
    funded: "Cash 결제됨",
    refunded: "환불됨",
    failed: "결제 실패",
  };
  const en: Record<PlatformPopupOwnerPaymentStatus, string> = {
    unfunded: "Unfunded",
    funded: "Cash paid",
    refunded: "Refunded",
    failed: "Payment failed",
  };
  return (lang === "en" ? en : ko)[status] ?? status;
}

export function platformPopupCampaignStatusLabel(
  status: PlatformPopupCampaignStatus,
  lang: "ko" | "en"
): string {
  const ko: Record<PlatformPopupCampaignStatus, string> = {
    draft: "작성 중",
    pending_review: "검토 대기",
    approved: "승인",
    scheduled: "예약",
    active: "노출 중",
    paused: "일시중지",
    ended: "종료",
    rejected: "반려",
  };
  const en: Record<PlatformPopupCampaignStatus, string> = {
    draft: "Draft",
    pending_review: "Pending review",
    approved: "Approved",
    scheduled: "Scheduled",
    active: "Live",
    paused: "Paused",
    ended: "Ended",
    rejected: "Rejected",
  };
  return (lang === "en" ? en : ko)[status] ?? status;
}

/** Hub ops chips — maps to campaign status filters. */
export const PLATFORM_POPUP_HUB_OPS_CHIPS = [
  { key: "pending_review", status: "pending_review" as const },
  { key: "scheduled", status: "scheduled" as const },
  { key: "active", status: "active" as const },
  { key: "paused", status: "paused" as const },
  { key: "ended", status: "ended" as const },
] as const;

export const PLATFORM_POPUP_HUB_REQUEST_CHIPS = [
  { key: "submitted", status: "submitted" as const },
  { key: "under_review", status: "under_review" as const },
  { key: "revision_required", status: "revision_required" as const },
] as const;
