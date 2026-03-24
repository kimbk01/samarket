/**
 * 11단계: 차단 mock (Supabase 연동 시 교체)
 */

import type { BlockedUser } from "@/lib/types/report";

const CURRENT_USER_ID = "me";

export const MOCK_BLOCKED_USERS: BlockedUser[] = [];

export function getBlockedUserIds(userId: string): string[] {
  return MOCK_BLOCKED_USERS.filter((b) => b.userId === userId).map(
    (b) => b.blockedUserId
  );
}

export function getBlockedUsers(userId: string): BlockedUser[] {
  return MOCK_BLOCKED_USERS.filter((b) => b.userId === userId);
}

export function isBlocked(userId: string, blockedUserId: string): boolean {
  return MOCK_BLOCKED_USERS.some(
    (b) => b.userId === userId && b.blockedUserId === blockedUserId
  );
}

export function blockUser(
  userId: string,
  blockedUserId: string,
  blockedUserNickname?: string
): BlockedUser {
  if (isBlocked(userId, blockedUserId)) {
    return MOCK_BLOCKED_USERS.find(
      (b) => b.userId === userId && b.blockedUserId === blockedUserId
    )!;
  }
  const newBlock: BlockedUser = {
    id: `blk-${Date.now()}`,
    userId,
    blockedUserId,
    blockedUserNickname,
    createdAt: new Date().toISOString(),
  };
  MOCK_BLOCKED_USERS.push(newBlock);
  return newBlock;
}

export function unblockUser(userId: string, blockedUserId: string): boolean {
  const idx = MOCK_BLOCKED_USERS.findIndex(
    (b) => b.userId === userId && b.blockedUserId === blockedUserId
  );
  if (idx === -1) return false;
  MOCK_BLOCKED_USERS.splice(idx, 1);
  return true;
}
