/**
 * 14단계: 회원 제재 이력 mock (Supabase 연동 시 교체)
 */

import type { ModerationStatus } from "@/lib/types/report";
import type { UserModerationLog, UserModerationLogActionType } from "@/lib/types/admin-user";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_USER_MODERATION_LOGS: UserModerationLog[] = [];

export function addUserModerationLog(
  userId: string,
  fromStatus: ModerationStatus,
  toStatus: ModerationStatus,
  actionType: UserModerationLogActionType,
  note: string = ""
): UserModerationLog {
  const log: UserModerationLog = {
    id: `uml-${Date.now()}`,
    userId,
    fromStatus,
    toStatus,
    actionType,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  MOCK_USER_MODERATION_LOGS.push(log);
  return log;
}

export function getModerationLogsByUserId(userId: string): UserModerationLog[] {
  return MOCK_USER_MODERATION_LOGS.filter((l) => l.userId === userId);
}
