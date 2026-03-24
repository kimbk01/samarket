/**
 * 12단계: 관리자 처리 이력 mock (Supabase 연동 시 교체)
 */

import type { ModerationAction, ReportTargetType } from "@/lib/types/report";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_MODERATION_ACTIONS: ModerationAction[] = [];

export function addModerationAction(
  reportId: string,
  targetUserId: string,
  targetType: ReportTargetType,
  actionType: ModerationAction["actionType"],
  note: string = ""
): ModerationAction {
  const action: ModerationAction = {
    id: `mod-${Date.now()}`,
    reportId,
    targetUserId,
    targetType,
    actionType,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  MOCK_MODERATION_ACTIONS.push(action);
  return action;
}

export function getActionsByReportId(reportId: string): ModerationAction[] {
  return MOCK_MODERATION_ACTIONS.filter((a) => a.reportId === reportId);
}

export function getActionsByTargetUserId(targetUserId: string): ModerationAction[] {
  return MOCK_MODERATION_ACTIONS.filter((a) => a.targetUserId === targetUserId);
}
