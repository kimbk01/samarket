"use client";

import type { Review } from "@/lib/types/review";
import { ReviewCard } from "./ReviewCard";

interface ReviewListProps {
  reviews: Review[];
  /** reviewerId -> nickname (optional) */
  reviewerLabels?: Record<string, string>;
}

export function ReviewList({ reviews, reviewerLabels }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[14px] text-sam-muted">아직 받은 후기가 없어요</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {reviews.map((review) => (
        <li key={review.id}>
          <ReviewCard
            review={review}
            reviewerLabel={reviewerLabels?.[review.reviewerId]}
          />
        </li>
      ))}
    </ul>
  );
}
