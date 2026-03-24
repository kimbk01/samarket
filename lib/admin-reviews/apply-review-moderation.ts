/**
 * 16단계: 관리자 리뷰 조치 (reviewStatus·조치이력 연동)
 */

import type { ReviewStatus } from "@/lib/types/review";
import type { ReviewModerationActionType } from "@/lib/types/admin-review";
import { getAdminReviewById, setReviewStatus } from "./mock-admin-reviews";
import { addReviewModerationLog } from "./mock-review-moderation-logs";
import { recalculateTrustForUser } from "./mock-admin-trust-summaries";

export interface ApplyReviewModerationResult {
  ok: boolean;
  message?: string;
}

export function applyReviewModerationAction(
  reviewId: string,
  actionType: ReviewModerationActionType,
  note: string = ""
): ApplyReviewModerationResult {
  const review = getAdminReviewById(reviewId);
  if (!review) return { ok: false, message: "리뷰를 찾을 수 없습니다." };

  switch (actionType) {
    case "hide_review":
      setReviewStatus(reviewId, "hidden");
      addReviewModerationLog(reviewId, "hide_review", note);
      return { ok: true };
    case "restore_review":
      setReviewStatus(reviewId, "visible");
      addReviewModerationLog(reviewId, "restore_review", note);
      return { ok: true };
    case "review_only":
      addReviewModerationLog(reviewId, "review_only", note);
      return { ok: true };
    case "recalculate_trust":
      recalculateTrustForUser(review.targetUserId);
      addReviewModerationLog(reviewId, "recalculate_trust", note);
      return { ok: true };
    default:
      return { ok: false, message: "지원하지 않는 처리입니다." };
  }
}
