/**
 * Manage ▼ actions by ops status — writer-backed only.
 */

import type { AdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

export type AdsManageAction =
  | WorkspaceDrawerAction
  | "view_detail"
  | "preview"
  | "view_live"
  | "view_history"
  | "view_reject_reason"
  | "edit"
  | "change_period"
  | "change_order"
  | "go_live_now"
  | "duplicate";

const LABELS: Record<AdsManageAction, { ko: string; en: string }> = {
  view_detail: { ko: "상세보기", en: "Details" },
  preview: { ko: "미리보기", en: "Preview" },
  view_live: { ko: "실제 노출 보기", en: "View live" },
  view_history: { ko: "이력보기", en: "History" },
  view_reject_reason: { ko: "반려 사유", en: "Rejection reason" },
  edit: { ko: "수정", en: "Edit" },
  change_period: { ko: "기간 변경", en: "Change period" },
  change_order: { ko: "순서 변경", en: "Change order" },
  go_live_now: { ko: "즉시 노출", en: "Go live now" },
  duplicate: { ko: "복제", en: "Duplicate" },
  approve: { ko: "승인", en: "Approve" },
  reject: { ko: "반려", en: "Reject" },
  request_changes: { ko: "수정 요청", en: "Request changes" },
  pause: { ko: "일시중지", en: "Pause" },
  resume: { ko: "다시 노출", en: "Resume" },
  end: { ko: "종료", en: "End" },
  terminate: { ko: "강제 종료", en: "Force end" },
  delete_safe_draft: { ko: "삭제", en: "Delete" },
  add_internal_memo: { ko: "내부 메모", en: "Internal memo" },
  extend_compensation: { ko: "보상 연장", en: "Comp. extend" },
};

export function adsManageActionLabel(action: AdsManageAction, ko: boolean): string {
  return ko ? LABELS[action].ko : LABELS[action].en;
}

export function listAdsManageActions(input: {
  status: AdsOpsStatus;
  family: string;
  isAdminDirect?: boolean;
}): AdsManageAction[] {
  const { status, family } = input;
  const isDelivery = family.startsWith("delivery");
  const isBoost = family.startsWith("boost");
  const isPopup = family.includes("popup");
  const isFeed = family === "feed_banner";

  if (status === "pending") {
    return [
      "view_detail",
      "preview",
      "approve",
      "reject",
      "edit",
      ...(isDelivery ? (["request_changes"] as const) : []),
      "delete_safe_draft",
    ];
  }
  if (status === "scheduled") {
    return [
      "view_detail",
      "preview",
      "edit",
      "go_live_now",
      "change_period",
      "end",
      "delete_safe_draft",
    ];
  }
  if (status === "live") {
    return [
      "view_detail",
      "view_live",
      "preview",
      "edit",
      "pause",
      "change_period",
      ...(isDelivery || isFeed ? (["change_order"] as const) : []),
      "end",
    ];
  }
  if (status === "paused") {
    return [
      "view_detail",
      "preview",
      "edit",
      "resume",
      "change_period",
      "end",
      "delete_safe_draft",
    ];
  }
  if (status === "ended") {
    return ["view_detail", "view_history", "delete_safe_draft"];
  }
  if (status === "rejected") {
    return ["view_detail", "view_reject_reason", "edit", "delete_safe_draft"];
  }
  if (status === "draft") {
    return ["view_detail", "edit", "preview", "delete_safe_draft"];
  }
  if (status === "archived") {
    return ["view_detail", "view_history"];
  }
  void isBoost;
  void isPopup;
  return ["view_detail"];
}
