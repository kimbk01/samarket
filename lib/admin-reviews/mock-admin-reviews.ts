/**
 * 16단계: 관리자 리뷰 목록/상세 (10단계 MOCK_REVIEWS 기반)
 */

import type { ReviewStatus } from "@/lib/types/review";
import type { AdminReview } from "@/lib/types/admin-review";
import { MOCK_REVIEWS } from "@/lib/reviews/mock-reviews";
import { getProductById } from "@/lib/mock-products";
import { getNickname } from "@/lib/admin-reports/mock-user-moderation";

const ADMIN_MEMO: Record<string, string> = {};
const REPORT_COUNT: Record<string, number> = {};

function buildAdminReview(r: (typeof MOCK_REVIEWS)[0]): AdminReview {
  const status: ReviewStatus = (r.reviewStatus ?? "visible") as ReviewStatus;
  const product = getProductById(r.productId);
  return {
    id: r.id,
    transactionId: r.transactionId,
    productId: r.productId,
    productTitle: product?.title ?? r.productId,
    reviewerId: r.reviewerId,
    reviewerNickname: getNickname(r.reviewerId),
    targetUserId: r.targetUserId,
    targetNickname: getNickname(r.targetUserId),
    role: r.role,
    rating: r.rating,
    tags: r.tags ?? [],
    comment: r.comment,
    createdAt: r.createdAt,
    reviewStatus: status,
    reportCount: REPORT_COUNT[r.id] ?? 0,
    adminMemo: ADMIN_MEMO[r.id],
  };
}

export function getAdminReviews(): AdminReview[] {
  return MOCK_REVIEWS.map(buildAdminReview).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getAdminReviewById(reviewId: string): AdminReview | undefined {
  const r = MOCK_REVIEWS.find((x) => x.id === reviewId);
  if (!r) return undefined;
  return buildAdminReview(r);
}

export function getAdminMemo(reviewId: string): string {
  return ADMIN_MEMO[reviewId] ?? "";
}

export function setAdminMemo(reviewId: string, memo: string): void {
  if (memo.trim()) ADMIN_MEMO[reviewId] = memo.trim();
  else delete ADMIN_MEMO[reviewId];
}

export function setReviewStatus(reviewId: string, status: ReviewStatus): boolean {
  const r = MOCK_REVIEWS.find((x) => x.id === reviewId);
  if (!r) return false;
  r.reviewStatus = status;
  return true;
}
