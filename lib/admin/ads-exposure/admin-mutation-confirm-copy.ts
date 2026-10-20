/**
 * Admin Ads mutation confirmation copy SSOT (CUT R1).
 * Read-only actions must never use these prompts.
 */

import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import {
  adminActionLevel,
  adminActionRequiresReason,
  type AdminActionKind,
} from "@/lib/admin/operator-ux/admin-action-levels";
import type { AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";

export type AdminMutationConfirmTone = "primary" | "danger";

export type AdminMutationConfirmCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AdminMutationConfirmTone;
  reasonRequired: boolean;
  reasonLabel: string;
  /** 확인 단계 (재설계 R2) — 동작 표 `adminActionLevel` 에서만 정한다. */
  level: AdminConfirmLevel;
};

/**
 * 광고 작업 화면 동작 → 동작 표 종류 (R2 · `admin-action-levels.ts`).
 * 승인 = approve(L2) · 반려 = reject(L2) · 수정 요청(보류, 업주에게 반려 사유 전달) = reject(L2) ·
 * 제재 일시중지 = sanction(L2) · 배달·커뮤니티 일시중지(writer 가 사유 필수) = sanction(L2) · 그 밖의 일시중지 = exposeStop(L1) ·
 * 재개 = resume(L1) · 종료 = forceCancel(L3) · 초안 삭제 = delete(L3) · 보상 연장 = payout(L2) · 기간 변경 = save(L1).
 */
export function adsWorkspaceActionKind(
  action: WorkspaceDrawerAction,
  family: string | null,
  opts?: { boostSanction?: boolean }
): AdminActionKind {
  switch (action) {
    case "approve":
      return "approve";
    case "reject":
    case "request_changes":
      return "reject";
    case "pause":
      if (opts?.boostSanction) return "sanction";
      // Delivery writer / community route require a reason on pause.
      if (family === "delivery_banner" || family === "delivery_sponsored" || family === "boost_community") {
        return "sanction";
      }
      return "exposeStop";
    case "resume":
      return "resume";
    case "end":
    case "terminate":
      return "forceCancel";
    case "delete_safe_draft":
      return "delete";
    case "extend_compensation":
      return "payout";
    default:
      return "save";
  }
}

export function adsWorkspaceActionNeedsReason(
  action: WorkspaceDrawerAction,
  family: string | null,
  opts?: { boostSanction?: boolean }
): boolean {
  return adminActionRequiresReason(adsWorkspaceActionKind(action, family, opts));
}

export function adsWorkspaceMutationConfirmCopy(
  action: WorkspaceDrawerAction,
  ko: boolean,
  opts?: { boostSanction?: boolean; family?: string | null }
): AdminMutationConfirmCopy {
  const cancelLabel = ko ? "취소" : "Cancel";
  const boostSanction = Boolean(opts?.boostSanction) && action === "pause";
  const kind = adsWorkspaceActionKind(action, opts?.family ?? null, { boostSanction });
  const level = adminActionLevel(kind);
  const reasonRequired = adminActionRequiresReason(kind);
  const reasonLabel =
    action === "request_changes"
      ? ko
        ? "보류 사유"
        : "Hold reason"
      : action === "reject"
        ? ko
          ? "반려 사유"
          : "Rejection reason"
        : ko
          ? "사유"
          : "Reason";

  if (boostSanction) {
    return {
      title: ko ? "상위노출을 제재하시겠습니까?" : "Sanction this boost?",
      body: ko
        ? "제재 후 해당 상위노출은 실제 노출에서 제외됩니다."
        : "After sanction, this boost is removed from live exposure.",
      confirmLabel: ko ? "제재" : "Sanction",
      cancelLabel,
      tone: "danger",
      reasonRequired,
      reasonLabel,
      level,
    };
  }

  switch (action) {
    case "approve":
      return {
        title: ko ? "광고를 승인하시겠습니까?" : "Approve this ad?",
        body: ko
          ? "승인 후 노출 조건을 충족하면 광고가 노출될 수 있습니다."
          : "After approval, the ad may expose when conditions are met.",
        confirmLabel: ko ? "승인" : "Approve",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
        level,
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
        level,
      };
    case "reject":
      return {
        title: ko ? "광고를 반려하시겠습니까?" : "Reject this ad?",
        body: ko
          ? "반려 후 해당 신청은 노출되지 않습니다."
          : "After rejection, the application will not expose.",
        confirmLabel: ko ? "반려" : "Reject",
        cancelLabel,
        tone: "danger",
        reasonRequired,
        reasonLabel,
        level,
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
        level,
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
        reasonRequired,
        reasonLabel,
        level,
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
        level,
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
        reasonRequired,
        reasonLabel,
        level,
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
        level,
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
        reasonRequired,
        reasonLabel,
        level,
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
        reasonRequired,
        reasonLabel,
        level,
      };
    default:
      return {
        title: ko ? "이 작업을 진행하시겠습니까?" : "Continue with this action?",
        body: ko ? "확인 후 상태가 변경됩니다." : "Confirming will change the state.",
        confirmLabel: ko ? "확인" : "Confirm",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
        level,
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
    level: adminActionLevel("save"),
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
    level: adminActionLevel("save"),
  };
}
