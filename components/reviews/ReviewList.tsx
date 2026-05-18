"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { Review } from "@/lib/types/review";
import { ReviewCard } from "./ReviewCard";

interface ReviewListProps {
  reviews: Review[];
  /** reviewerId -> nickname (optional) */
  reviewerLabels?: Record<string, string>;
}

export function ReviewList({ reviews, reviewerLabels }: ReviewListProps) {
  const { t } = useI18n();
  if (reviews.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="sam-text-body text-sam-muted">{t("ui_review_empty")}</p>
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
