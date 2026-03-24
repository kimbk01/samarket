"use client";

import type { Review } from "@/lib/types/review";
import { formatTimeAgo } from "@/lib/utils/format";

interface ReviewCardProps {
  review: Review;
  /** 작성자 표시용 (닉네임 또는 "구매자"/"판매자") */
  reviewerLabel?: string;
}

export function ReviewCard({ review, reviewerLabel }: ReviewCardProps) {
  const roleLabel = review.role === "buyer_to_seller" ? "구매자" : "판매자";
  const label = reviewerLabel ?? roleLabel;

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-gray-500">{label}</span>
        <span className="text-[11px] text-gray-400">
          {formatTimeAgo(review.createdAt)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[13px] font-medium text-gray-900">
          {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
        </span>
        <span className="text-[12px] text-gray-500">{review.rating}점</span>
      </div>
      {review.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {review.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {review.comment && (
        <p className="mt-2 text-[13px] text-gray-700 whitespace-pre-wrap">
          {review.comment}
        </p>
      )}
    </div>
  );
}
