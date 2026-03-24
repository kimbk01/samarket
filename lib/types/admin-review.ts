/**
 * 16단계: 관리자 리뷰관리 타입 (10단계 Review와 호환)
 */

import type { ReviewRole, ReviewStatus } from "@/lib/types/review";

export type { ReviewStatus };

export type PublicReviewType = "good" | "normal" | "bad";

export interface AdminReview {
  id: string;
  transactionId: string;
  productId: string;
  productTitle: string;
  reviewerId: string;
  reviewerNickname: string;
  targetUserId: string;
  targetNickname: string;
  role: ReviewRole;
  rating: number;
  tags: string[];
  comment: string;
  createdAt: string;
  reviewStatus: ReviewStatus;
  reportCount: number;
  adminMemo?: string;
  /** 당근형: 공개 후기 타입 */
  publicReviewType?: PublicReviewType;
  /** 당근형: 비공개 태그 */
  privateTags?: string[];
  /** 당근형: 선택 긍정 태그 키 */
  positiveTagKeys?: string[];
  /** 당근형: 선택 부정 태그 키 */
  negativeTagKeys?: string[];
  /** 당근형: 익명 부정평가 여부 */
  isAnonymousNegative?: boolean;
  /** 판매자/구매자 표시용: reviewer가 판매자면 target이 구매자 */
  sellerNickname?: string;
  buyerNickname?: string;
}

export type ReviewModerationActionType =
  | "hide_review"
  | "restore_review"
  | "review_only"
  | "recalculate_trust";

export interface ReviewModerationLog {
  id: string;
  reviewId: string;
  actionType: ReviewModerationActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}

export interface AdminTrustSummary {
  userId: string;
  nickname: string;
  reviewCount: number;
  averageRating: number;
  mannerScore: number;
  positiveCount: number;
  negativeCount: number;
  hiddenReviewCount: number;
  updatedAt: string;
}
