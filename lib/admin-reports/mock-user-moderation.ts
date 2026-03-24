/**
 * 12단계: 사용자 제재 상태 mock (Supabase 연동 시 교체)
 */

import type { UserModerationState, ModerationStatus } from "@/lib/types/report";

/** 14단계: 회원 목록 닉네임 (mock-products 판매자와 동기화) */
const NICKNAME_MAP: Record<string, string> = {
  me: "나",
  s1: "판매자A",
  s2: "판매자B",
  s3: "판매자C",
  s4: "판매자D",
  s5: "판매자E",
};

export const MOCK_USER_MODERATION_STATE: UserModerationState[] = [];

export function getUserModerationState(userId: string): UserModerationState | undefined {
  return MOCK_USER_MODERATION_STATE.find((s) => s.userId === userId);
}

export function setUserModerationState(
  userId: string,
  status: ModerationStatus,
  reason?: string
): UserModerationState {
  const nickname = NICKNAME_MAP[userId] ?? userId;
  const existing = MOCK_USER_MODERATION_STATE.find((s) => s.userId === userId);
  const updated: UserModerationState = {
    userId,
    nickname,
    status,
    reason,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    existing.status = status;
    existing.reason = reason;
    existing.updatedAt = updated.updatedAt;
    return existing;
  }
  MOCK_USER_MODERATION_STATE.push(updated);
  return updated;
}

export function getNickname(userId: string): string {
  return NICKNAME_MAP[userId] ?? userId;
}
