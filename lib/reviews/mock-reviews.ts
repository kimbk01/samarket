/**
 * 10단계: 후기 mock (Supabase 연동 시 교체)
 */

import type { Review, ReviewRole, Transaction } from "@/lib/types/review";
import { MOCK_DATA_AS_OF_MS } from "@/lib/mock-time-anchor";
import { getCompletedTransactionsForUser } from "./mock-transactions";

export const REVIEW_TAGS = [
  "친절해요",
  "응답이 빨라요",
  "시간 약속을 잘 지켜요",
  "상품 설명이 정확해요",
] as const;

export const MOCK_REVIEWS: Review[] = [
  {
    id: "rv-1",
    transactionId: "tx-1",
    productId: "4",
    reviewerId: "me",
    targetUserId: "s4",
    role: "buyer_to_seller",
    rating: 5,
    tags: ["친절해요", "응답이 빨라요"],
    comment: "감사합니다. 잘 받았어요!",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "rv-2",
    transactionId: "tx-2",
    productId: "my-3",
    reviewerId: "b2",
    targetUserId: "me",
    role: "buyer_to_seller",
    rating: 4,
    tags: ["상품 설명이 정확해요"],
    comment: "만족스러운 거래였어요.",
    createdAt: new Date(MOCK_DATA_AS_OF_MS - 86400000 * 4).toISOString(),
  },
];

/** 대상자 기준 후기 (visible만, 16단계 숨김 제외) */
export function getReviewsForTarget(userId: string): Review[] {
  return MOCK_REVIEWS.filter(
    (r) => r.targetUserId === userId && (r.reviewStatus ?? "visible") === "visible"
  ).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getReviewsForTransaction(transactionId: string): Review[] {
  return MOCK_REVIEWS.filter((r) => r.transactionId === transactionId);
}

/** 해당 거래·역할로 이미 작성했는지 */
export function hasWrittenReview(
  transactionId: string,
  role: ReviewRole
): boolean {
  return MOCK_REVIEWS.some((r) => r.transactionId === transactionId && r.role === role);
}

export function addReview(review: Omit<Review, "id" | "createdAt">): Review {
  const newReview: Review = {
    ...review,
    id: `rv-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  MOCK_REVIEWS.push(newReview);
  return newReview;
}

export interface ReviewableItem {
  transaction: Transaction;
  role: ReviewRole;
  targetUserId: string;
}

export function getReviewableItems(userId: string): ReviewableItem[] {
  const list: ReviewableItem[] = [];
  const completed = getCompletedTransactionsForUser(userId);
  for (const t of completed) {
    if (t.buyerId === userId && !hasWrittenReview(t.id, "buyer_to_seller")) {
      list.push({ transaction: t, role: "buyer_to_seller", targetUserId: t.sellerId });
    }
    if (t.sellerId === userId && !hasWrittenReview(t.id, "seller_to_buyer")) {
      list.push({ transaction: t, role: "seller_to_buyer", targetUserId: t.buyerId });
    }
  }
  return list;
}
