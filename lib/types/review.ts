/**
 * 10단계: 거래·후기·신뢰도 타입 (신고/제재 확장 시 활용)
 */

export type TransactionStatus = "completed" | "cancelled";

export interface Transaction {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  status: TransactionStatus;
  completedAt: string;
}

export type ReviewRole = "buyer_to_seller" | "seller_to_buyer";

/** 16단계: 관리자 리뷰 상태 (기본 visible) */
export type ReviewStatus = "visible" | "hidden" | "reported";

export interface Review {
  id: string;
  transactionId: string;
  productId: string;
  reviewerId: string;
  targetUserId: string;
  role: ReviewRole;
  rating: number;
  tags: string[];
  comment: string;
  createdAt: string;
  /** 16단계: 숨김/신고 등, 없으면 visible */
  reviewStatus?: ReviewStatus;
}

export interface UserTrustSummary {
  userId: string;
  reviewCount: number;
  averageRating: number;
  mannerScore: number;
  positiveCount: number;
  negativeCount: number;
  summaryTags: string[];
}
