/**
 * Popup Admin completeness / operating classification — display only.
 * Does not change resolver eligibility.
 */

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

  if (status === "pending_review" || approval === "pending_review") {
    return {
      completeness: "pending_review",
      missing,
      operatingLabelKo: "승인 대기",
      operatingLabelEn: "Pending approval",
    };
  }

  if (status === "draft" || status === "not_submitted" || approval === "not_submitted") {
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

  const opsKo =
    status === "active"
      ? "노출 중"
      : status === "scheduled"
        ? "예약"
        : status === "paused"
          ? "일시중지"
          : status === "ended"
            ? "종료"
            : status === "rejected"
              ? "반려"
              : status;
  const opsEn =
    status === "active"
      ? "Active"
      : status === "scheduled"
        ? "Scheduled"
        : status === "paused"
          ? "Paused"
          : status === "ended"
            ? "Ended"
            : status === "rejected"
              ? "Rejected"
              : status;

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
    if (m === "creative") return ko ? "이미지 없음" : "No image";
    if (m === "schedule") return ko ? "노출 기간 없음" : "No schedule";
    return ko ? "이름 없음" : "No name";
  });
  return parts.join(ko ? " · " : " · ");
}

export function popupWaitingReasonLabel(input: {
  winnerDisplayName: string | null;
  winnerPriority: number | null;
  winnerPeriodLabel: string | null;
  ko: boolean;
}): string {
  const name = input.winnerDisplayName?.trim() || (input.ko ? "다른 팝업" : "another popup");
  if (input.ko) {
    const pri =
      input.winnerPriority == null ? "" : `\n우선순위: ${input.winnerPriority}`;
    const period = input.winnerPeriodLabel ? `\n기간: ${input.winnerPeriodLabel}` : "";
    return `현재 다른 팝업이 우선 노출 중입니다.\n현재 표시 중: ${name}${pri}${period}\n\n같은 위치에 여러 광고가 있는 경우 현재 우선순위 기준에 따라 한 건이 표시됩니다.`;
  }
  const pri =
    input.winnerPriority == null ? "" : `\nPriority: ${input.winnerPriority}`;
  const period = input.winnerPeriodLabel ? `\nPeriod: ${input.winnerPeriodLabel}` : "";
  return `Another popup is currently showing.\nLive now: ${name}${pri}${period}\n\nWhen multiple ads share a placement, one is shown by the current priority rules.`;
}
