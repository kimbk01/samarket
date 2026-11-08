/**
 * Popup Admin completeness / operating classification — display only.
 * Does not change resolver eligibility.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type PopupCompletenessClass =
  | "orphan_partial"
  | "incomplete"
  | "draft_ready"
  | "pending_review"
  | "operating";

export type PopupMissingField = "creative" | "schedule" | "name";

export function classifyPopupCampaignCompleteness(input: {
  status: string;
  approvalStatus?: string | null;
  hasReadyCreative: boolean;
  startAt?: string | null;
  endAt?: string | null;
  name?: string | null;
  /** Admin Direct has no human approval queue — never classify as pending_review. */
  adminDirect?: boolean;
}): {
  completeness: PopupCompletenessClass;
  missing: PopupMissingField[];
  operatingLabelKo: string;
  operatingLabelEn: string;
} {
  const status = String(input.status ?? "").toLowerCase();
  const approval = String(input.approvalStatus ?? "").toLowerCase();
  const hasPeriod = Boolean(input.startAt && input.endAt);
  const missing: PopupMissingField[] = [];
  if (!input.hasReadyCreative) missing.push("creative");
  if (!hasPeriod) missing.push("schedule");
  const adminDirect = Boolean(input.adminDirect);

  // Owner/Member human review only. Admin Direct pending_review = incomplete re-registration.
  if (!adminDirect && (status === "pending_review" || approval === "pending_review")) {
    return {
      completeness: "pending_review",
      missing,
      operatingLabelKo: "승인 대기",
      operatingLabelEn: "Pending approval",
    };
  }

  if (
    status === "draft" ||
    status === "not_submitted" ||
    approval === "not_submitted" ||
    (adminDirect && (status === "pending_review" || approval === "pending_review"))
  ) {
    if (adminDirect && (status === "pending_review" || approval === "pending_review")) {
      return {
        completeness: "incomplete",
        missing,
        operatingLabelKo: "불완전",
        operatingLabelEn: "Incomplete",
      };
    }
    if (missing.length >= 2 || (!input.hasReadyCreative && !hasPeriod)) {
      return {
        completeness: "orphan_partial",
        missing,
        operatingLabelKo: "불완전",
        operatingLabelEn: "Incomplete",
      };
    }
    if (missing.length > 0) {
      return {
        completeness: "incomplete",
        missing,
        operatingLabelKo: "불완전",
        operatingLabelEn: "Incomplete",
      };
    }
    return {
      completeness: "draft_ready",
      missing,
      operatingLabelKo: "임시저장",
      operatingLabelEn: "Saved draft",
    };
  }

  const opsKey: MessageKey | null =
    status === "active"
      ? "admin_ads_popup_ops_active"
      : status === "scheduled"
        ? "admin_ads_popup_ops_scheduled"
        : status === "paused"
          ? "admin_ads_popup_ops_paused"
          : status === "ended"
            ? "admin_ads_popup_ops_ended"
            : status === "rejected"
              ? "admin_ads_popup_ops_rejected"
              : null;
  const opsKo = opsKey ? tx(true, opsKey) : status;
  const opsEn = opsKey ? tx(false, opsKey) : status;

  return {
    completeness: "operating",
    missing,
    operatingLabelKo: opsKo,
    operatingLabelEn: opsEn,
  };
}

export function popupMissingFieldsLabel(missing: PopupMissingField[], ko: boolean): string {
  if (!missing.length) return "";
  const parts = missing.map((m) => {
    if (m === "creative") return tx(ko, "admin_ads_exposure_no_image");
    if (m === "schedule") return tx(ko, "admin_ads_exposure_no_schedule");
    return tx(ko, "admin_ads_exposure_no_name");
  });
  return parts.join(ko ? " · " : " · ");
}

export function popupWaitingReasonLabel(input: {
  winnerDisplayName: string | null;
  winnerPriority: number | null;
  winnerPeriodLabel: string | null;
  ko: boolean;
}): string {
  const name = input.winnerDisplayName?.trim() || tx(input.ko, "admin_ads_exposure_another_popup");
  const pri =
    input.winnerPriority == null
      ? ""
      : `\n${tx(input.ko, "admin_ads_popup_waiting_priority", { priority: input.winnerPriority })}`;
  const period = input.winnerPeriodLabel
    ? `\n${tx(input.ko, "admin_ads_popup_waiting_period", { period: input.winnerPeriodLabel })}`
    : "";
  return tx(input.ko, "admin_ads_popup_waiting_reason", { name, pri, period });
}
