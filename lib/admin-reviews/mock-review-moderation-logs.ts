/**
 * 16단계: 리뷰 조치 이력 mock (Supabase 연동 시 교체)
 */

import type { ReviewModerationLog, ReviewModerationActionType } from "@/lib/types/admin-review";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_REVIEW_MODERATION_LOGS: ReviewModerationLog[] = [];

export function addReviewModerationLog(
  reviewId: string,
  actionType: ReviewModerationActionType,
  note: string = ""
): ReviewModerationLog {
  const log: ReviewModerationLog = {
    id: `rml-${Date.now()}`,
    reviewId,
    actionType,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  MOCK_REVIEW_MODERATION_LOGS.push(log);
  return log;
}

export function getReviewModerationLogsByReviewId(reviewId: string): ReviewModerationLog[] {
  return MOCK_REVIEW_MODERATION_LOGS.filter((l) => l.reviewId === reviewId);
}
