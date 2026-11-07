/**
 * Admin Ads mutation confirmation copy SSOT (CUT R1).
 * Read-only actions must never use these prompts.
 */

import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import {
  adminActionAllowsRetype,
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
  /**
   * 동작 표 종류 — 화면은 `confirmAdminAction({ action: copy.action, … })` 로 부른다.
   * 광고 조치는 대상 재입력이 없다(SSOT §3-1 · 2026-11-07) — `retypeAllowed` 는 항상 false.
   */
  action?: AdminActionKind;
  /** 대상 재입력 허용 여부 — 광고 조치 = false (동작 표 `adminActionAllowsRetype`). */
  retypeAllowed?: boolean;
  /** D-6: 공개 사유(120자) + 내부 메모 두 칸으로 받는지. */
  splitReason?: boolean;
};

/**
 * 광고 작업 화면 동작 → 동작 표 종류 (설계 §6 · FB-A05 · AD-103 · AL-04~06 · 2026-11-04 · `admin-action-levels.ts` 한 표).
 * 모든 광고 계열(상위노출·피드·팝업·배달)에서 같은 동작 = 같은 단계:
 * 승인 = approve(L2) · 반려·수정 요청 = reject(L2) · 상위노출 제재 정지 = sanction(L2) · 정지 = pause(L2) ·
 * 재개 = adResume(L2) · 종료 = end(L3: 사유 + 귀책 + 환급 미리보기 · 재입력 없음) · 삭제 = adDelete(L3: 사유만) ·
 * 유료·보상 연장 = extend(L2) · 기간 변경 = save(L1).
 * `family` 는 예전 계열별 분기 호환용 인자다 — 이제 단계는 계열과 상관없다.
 */
export function adsWorkspaceActionKind(
  action: WorkspaceDrawerAction,
  _family: string | null,
  opts?: { boostSanction?: boolean }
): AdminActionKind {
  switch (action) {
    case "approve":
      return "approve";
    case "reject":
    case "request_changes":
      return "reject";
    case "pause":
      return opts?.boostSanction ? "sanction" : "pause";
    case "resume":
      return "adResume";
    case "end":
    case "terminate":
      return "end";
    case "delete_safe_draft":
      return "adDelete";
    case "extend_compensation":
      return "extend";
    default:
      return "save";
  }
}

/** D-6: 회원·사장님에게 보이는 결과가 생기는 조치 = 공개 사유 + 내부 메모 두 칸. */
export function adsWorkspaceActionSplitsReason(action: WorkspaceDrawerAction): boolean {
  return (
    action === "pause" ||
    action === "resume" ||
    action === "end" ||
    action === "terminate" ||
    action === "extend_compensation"
  );
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
  const retypeAllowed = adminActionAllowsRetype(kind);
  const splitReason = adsWorkspaceActionSplitsReason(action);
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
      action: kind,
      retypeAllowed,
      splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
      };
    case "end":
    case "terminate":
      return {
        title: ko ? "광고를 종료하시겠습니까?" : "End this ad?",
        body: ko
          ? "종료하면 다시 노출할 수 없습니다. 귀책에 따라 남은 기간 비례 환급이 정해집니다."
          : "After ending, the ad cannot be shown again. Any pro-rated refund depends on who is at fault.",
        confirmLabel: ko ? "종료" : "End",
        cancelLabel,
        tone: "danger",
        reasonRequired,
        reasonLabel,
        level,
        action: kind,
        retypeAllowed,
        splitReason,
      };
    case "delete_safe_draft":
      return {
        title: ko ? "광고를 삭제하시겠습니까?" : "Delete this ad?",
        body: ko
          ? "사유만 입력하면 바로 삭제됩니다. 이력이 없는 초안은 완전히 지우고, 그 밖에는 목록에서 사라지며 「이력 › 삭제됨」에서 되돌릴 수 있습니다."
          : "Enter a reason to delete. A draft with no history is removed; otherwise it disappears from lists and can be restored from History › Deleted.",
        confirmLabel: ko ? "삭제" : "Delete",
        cancelLabel,
        tone: "danger",
        reasonRequired,
        reasonLabel,
        level,
        action: kind,
        retypeAllowed,
        splitReason,
      };
    case "extend_compensation":
      return {
        title: ko ? "기간을 연장하시겠습니까?" : "Extend the period?",
        body: ko
          ? "연장이 적용됩니다. 사유를 남겨 주세요."
          : "Compensation extension will apply. Please provide a reason.",
        confirmLabel: ko ? "연장" : "Extend",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
        level,
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
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
        action: kind,
        retypeAllowed,
        splitReason,
      };
    default:
      return {
        title: ko ? "이 작업을 진행하시겠습니까?" : "Continue with this action?",
        body: ko ? "확인 후 상태가 변경됩니다." : "Confirming will change the state.",
        confirmLabel: ko ? "진행" : "Continue",
        cancelLabel,
        tone: "primary",
        reasonRequired,
        reasonLabel,
        level,
        action: kind,
        retypeAllowed,
        splitReason,
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
