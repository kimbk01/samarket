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
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
  const cancelLabel = tx(ko, "common_cancel");
  const boostSanction = Boolean(opts?.boostSanction) && action === "pause";
  const kind = adsWorkspaceActionKind(action, opts?.family ?? null, { boostSanction });
  const level = adminActionLevel(kind);
  const reasonRequired = adminActionRequiresReason(kind);
  const retypeAllowed = adminActionAllowsRetype(kind);
  const splitReason = adsWorkspaceActionSplitsReason(action);
  const reasonLabel =
    action === "request_changes"
      ? tx(ko, "admin_ads_exposure_hold_reason")
      : action === "reject"
        ? tx(ko, "admin_ads_exposure_rejection_reason")
        : tx(ko, "admin_ads_exposure_reason");

  if (boostSanction) {
    return {
      title: tx(ko, "admin_ads_exposure_sanction_this_boost"),
      body: tx(ko, "admin_ads_exposure_after_sanction_this_boost_is_removed"),
      confirmLabel: tx(ko, "admin_ads_exposure_sanction"),
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
        title: tx(ko, "admin_ads_exposure_approve_this_ad"),
        body: tx(ko, "admin_ads_exposure_after_approval_the_ad_may_expose"),
        confirmLabel: tx(ko, "admin_ads_exposure_approve"),
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
        title: tx(ko, "admin_ads_exposure_hold_this_ad"),
        body: tx(ko, "admin_ads_exposure_held_ads_stay_off_exposure_until"),
        confirmLabel: tx(ko, "admin_ads_exposure_hold"),
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
        title: tx(ko, "admin_ads_exposure_reject_this_ad"),
        body: tx(ko, "admin_ads_exposure_after_rejection_the_application_will_not"),
        confirmLabel: tx(ko, "admin_ads_exposure_reject"),
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
        title: tx(ko, "admin_ads_exposure_pause_this_ad"),
        body: tx(ko, "admin_ads_exposure_after_pause_the_ad_is_removed"),
        confirmLabel: tx(ko, "admin_ads_exposure_pause"),
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
        title: tx(ko, "admin_ads_exposure_resume_this_ad"),
        body: tx(ko, "admin_ads_exposure_it_may_expose_again_when_conditions"),
        confirmLabel: tx(ko, "admin_ads_exposure_resume"),
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
        title: tx(ko, "admin_ads_exposure_end_this_ad"),
        body: tx(ko, "admin_ads_exposure_after_ending_the_ad_cannot_be"),
        confirmLabel: tx(ko, "admin_ads_exposure_end"),
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
        title: tx(ko, "admin_ads_exposure_delete_this_ad"),
        body: tx(ko, "admin_ads_exposure_enter_a_reason_to_delete_a"),
        confirmLabel: tx(ko, "common_delete"),
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
        title: tx(ko, "admin_ads_exposure_extend_the_period"),
        body: tx(ko, "admin_ads_exposure_compensation_extension_will_apply_please_provide"),
        confirmLabel: tx(ko, "admin_ads_exposure_extend"),
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
        title: tx(ko, "admin_ads_exposure_change_the_period"),
        body: tx(ko, "admin_ads_exposure_the_period_will_be_saved_with"),
        confirmLabel: tx(ko, "common_save"),
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
        title: tx(ko, "admin_ads_exposure_save_internal_memo"),
        body: tx(ko, "admin_ads_exposure_an_internal_admin_memo_will_be"),
        confirmLabel: tx(ko, "common_save"),
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
        title: tx(ko, "admin_ads_exposure_continue_with_this_action"),
        body: tx(ko, "admin_ads_exposure_confirming_will_change_the_state"),
        confirmLabel: tx(ko, "admin_ads_exposure_continue"),
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
    title: tx(ko, "admin_ads_exposure_save_banner_order"),
    body: tx(ko, "admin_ads_exposure_hero_banner_order_on_delivery_home"),
    confirmLabel: tx(ko, "common_save"),
    cancelLabel: tx(ko, "common_cancel"),
    tone: "primary",
    reasonRequired: false,
    reasonLabel: tx(ko, "admin_ads_exposure_reason"),
    level: adminActionLevel("save"),
  };
}

/** CUT R2 — create registration confirmation (before writer). */
export function adsCreateConfirmCopy(ko: boolean): AdminMutationConfirmCopy {
  return {
    title: tx(ko, "admin_ads_exposure_register_this_ad"),
    body: tx(ko, "admin_ads_exposure_confirm_placement_and_schedule_then_register"),
    confirmLabel: tx(ko, "admin_ads_exposure_register"),
    cancelLabel: tx(ko, "common_cancel"),
    tone: "primary",
    reasonRequired: false,
    reasonLabel: tx(ko, "admin_ads_exposure_reason"),
    level: adminActionLevel("save"),
  };
}
