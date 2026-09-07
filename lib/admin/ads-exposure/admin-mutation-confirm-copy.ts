/**
 * Admin Ads mutation confirmation copy SSOT (CUT R1).
 * Read-only actions must never use these prompts.
 */

import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

export type AdminMutationConfirmTone = "primary" | "danger";

export type AdminMutationConfirmCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AdminMutationConfirmTone;
  reasonRequired: boolean;
  reasonLabel: string;
};

export function adsWorkspaceActionNeedsReason(
  action: WorkspaceDrawerAction,
  family: string | null
): boolean {
  if (
    action === "reject" ||
    action === "request_changes" ||
    action === "extend_compensation" ||
    action === "terminate"
  ) {
    return true;
  }
  // Delivery writer requires reason on pause.
  if (action === "pause" && family === "delivery_banner") return true;
  if (action === "pause" && family === "delivery_sponsored") return true;
  return false;
}

export function adsWorkspaceMutationConfirmCopy(
  action: WorkspaceDrawerAction,
  ko: boolean,
  opts?: { boostSanction?: boolean; family?: string | null }
): AdminMutationConfirmCopy {
  const cancelLabel = ko ? "취소" : "Cancel";
  const reasonLabel = ko ? "사유" : "Reason";
  const reasonRequired = adsWorkspaceActionNeedsReason(action, opts?.family ?? null);
  const boostSanction = Boolean(opts?.boostSanction) && action === "pause";

  if (boostSanction) {
    return {
      title: ko ? "상위노출을 제재하시겠습니까?" : "Sanction this boost?",
      body: ko
        ? "제재 후 해당 상위노출은 실제 노출에서 제외됩니다."
        : "After sanction, this boost is removed from live exposure.",
      confirmLabel: ko ? "제재" : "Sanction",
      cancelLabel,
      tone: "danger",
      reasonRequired: false,
      reasonLabel,
    };
  }

  switch (action) {
    case "approve":
      return {
        title: ko ? "광고를 승인하시겠습니까?" : "Approve this ad?",
        body: ko
          ? "승인 후 설정 조건을 충족하면 광고가 노출될 수 있습니다."
          : "After approval, the ad may expose when conditions are met.",
        confirmLabel: ko ? "승인" : "Approve",
        cancelLabel,
        tone: "primary",
        reasonRequired: false,
        reasonLabel,
      };
    case "request_changes":
      return {
        title: ko ? "광고를 보류하시겠습니까?" : "Hold this ad?",
        body: ko
          ? "보류된 광고는 승인될 때까지 노출되지 않습니다."
          : "Held ads stay off exposure until approved.",
        confirmLabel: ko ? "보류" : "Hold",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
      };
    case "reject":
      return {
        title: ko ? "광고를 반려하시겠습니까?" : "Reject this ad?",
        body: ko
          ? "반려 후 신청은 노출되지 않습니다."
          : "After rejection, the application will not expose.",
        confirmLabel: ko ? "반려" : "Reject",
        cancelLabel,
        tone: "danger",
        reasonRequired,
        reasonLabel,
      };
    case "pause":
      return {
        title: ko ? "광고 노출을 일시중지하시겠습니까?" : "Pause this ad?",
        body: ko
          ? "일시중지 후 실제 노출에서 제외됩니다."
          : "After pause, the ad is removed from live exposure.",
        confirmLabel: ko ? "일시중지" : "Pause",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
      };
    case "resume":
      return {
        title: ko ? "광고 노출을 재개하시겠습니까?" : "Resume this ad?",
        body: ko
          ? "노출 조건을 충족하면 다시 노출됩니다."
          : "It may expose again when conditions are met.",
        confirmLabel: ko ? "재개" : "Resume",
        cancelLabel,
        tone: "primary",
        reasonRequired: false,
        reasonLabel,
      };
    case "end":
    case "terminate":
      return {
        title: ko ? "광고를 종료하시겠습니까?" : "End this ad?",
        body: ko
          ? "종료 후에는 기존 lifecycle 정책에 따라 재활성화가 제한될 수 있습니다."
          : "After ending, reactivation may be restricted by lifecycle policy.",
        confirmLabel: ko ? "종료" : "End",
        cancelLabel,
        tone: "danger",
        reasonRequired,
        reasonLabel,
      };
    case "delete_safe_draft":
      return {
        title: ko ? "광고를 삭제하시겠습니까?" : "Delete this draft?",
        body: ko
          ? "임시저장 초안만 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
          : "Only a safe draft is deleted. This cannot be undone.",
        confirmLabel: ko ? "삭제" : "Delete",
        cancelLabel,
        tone: "danger",
        reasonRequired: false,
        reasonLabel,
      };
    case "extend_compensation":
      return {
        title: ko ? "기간을 연장하시겠습니까?" : "Extend the period?",
        body: ko
          ? "보상 연장이 적용됩니다. 사유를 남겨 주세요."
          : "Compensation extension will apply. Please provide a reason.",
        confirmLabel: ko ? "연장" : "Extend",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
      };
    case "change_period":
      return {
        title: ko ? "기간을 변경하시겠습니까?" : "Change the period?",
        body: ko
          ? "입력한 시작·종료 일시로 기간이 저장됩니다."
          : "The period will be saved with the entered start and end.",
        confirmLabel: ko ? "저장" : "Save",
        cancelLabel,
        tone: "primary",
        reasonRequired: false,
        reasonLabel,
      };
    case "add_internal_memo":
      // Ordinary note save — UI must call writer without confirmation dialog.
      return {
        title: ko ? "내부 메모를 저장하시겠습니까?" : "Save internal memo?",
        body: ko
          ? "관리자 내부 메모가 기록됩니다."
          : "An internal admin memo will be recorded.",
        confirmLabel: ko ? "저장" : "Save",
        cancelLabel,
        tone: "primary",
        reasonRequired: false,
        reasonLabel,
      };
    default:
      return {
        title: ko ? "이 작업을 진행하시겠습니까?" : "Continue with this action?",
        body: ko ? "확인 후 상태가 변경됩니다." : "Confirming will change the state.",
        confirmLabel: ko ? "확인" : "Confirm",
        cancelLabel,
        tone: "primary",
        reasonRequired: false,
        reasonLabel,
      };
  }
}

export function adsPlacementReorderConfirmCopy(ko: boolean): AdminMutationConfirmCopy {
  return {
    title: ko ? "배너 순서를 저장하시겠습니까?" : "Save banner order?",
    body: ko
      ? "저장 후 배달 홈 상단 배너 노출 순서가 변경됩니다."
      : "Hero banner order on Delivery home will change after save.",
    confirmLabel: ko ? "저장" : "Save",
    cancelLabel: ko ? "취소" : "Cancel",
    tone: "primary",
    reasonRequired: false,
    reasonLabel: ko ? "사유" : "Reason",
  };
}

/** CUT R2 — create registration confirmation (before writer). */
export function adsCreateConfirmCopy(ko: boolean): AdminMutationConfirmCopy {
  return {
    title: ko ? "광고를 등록하시겠습니까?" : "Register this ad?",
    body: ko
      ? "설정한 노출 위치와 기간을 확인한 후 등록합니다."
      : "Confirm placement and schedule, then register.",
    confirmLabel: ko ? "등록" : "Register",
    cancelLabel: ko ? "취소" : "Cancel",
    tone: "primary",
    reasonRequired: false,
    reasonLabel: ko ? "사유" : "Reason",
  };
}
