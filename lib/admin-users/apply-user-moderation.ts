/**
 * 14단계: 관리자 회원 제재 액션 (12단계 setUserModerationState·이력 연동)
 */

import type { ModerationStatus } from "@/lib/types/report";
import type { UserModerationLogActionType } from "@/lib/types/admin-user";
import { getUserModerationState, setUserModerationState } from "@/lib/admin-reports/mock-user-moderation";
import { addUserModerationLog } from "./mock-user-moderation-logs";

export interface ApplyUserModerationResult {
  ok: boolean;
  message?: string;
}

const TO_STATUS: Record<"warn" | "suspend" | "ban" | "restore", ModerationStatus> = {
  warn: "warned",
  suspend: "suspended",
  ban: "banned",
  restore: "normal",
};

export function applyUserModerationAction(
  userId: string,
  actionType: UserModerationLogActionType,
  note: string = ""
): ApplyUserModerationResult {
  const current = getUserModerationState(userId);
  const fromStatus: ModerationStatus = current?.status ?? "normal";

  if (actionType === "warn" || actionType === "suspend" || actionType === "ban") {
    const toStatus = TO_STATUS[actionType];
    setUserModerationState(userId, toStatus, note || undefined);
    addUserModerationLog(userId, fromStatus, toStatus, actionType, note);
    return { ok: true };
  }

  if (actionType === "restore") {
    const toStatus = "normal";
    setUserModerationState(userId, toStatus, undefined);
    addUserModerationLog(userId, fromStatus, toStatus, "restore", note);
    return { ok: true };
  }

  return { ok: false, message: "지원하지 않는 처리입니다." };
}
