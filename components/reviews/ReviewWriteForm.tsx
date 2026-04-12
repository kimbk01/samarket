"use client";

import { useState } from "react";
import type { ReviewRole } from "@/lib/types/review";
import type { Transaction } from "@/lib/types/review";
import { REVIEW_TAGS } from "@/lib/reviews/mock-reviews";
import { addReview } from "@/lib/reviews/mock-reviews";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";

interface ReviewWriteFormProps {
  transaction: Transaction;
  role: ReviewRole;
  targetUserId: string;
  targetLabel: string;
  productTitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReviewWriteForm({
  transaction,
  role,
  targetUserId,
  targetLabel,
  productTitle,
  onSuccess,
  onCancel,
}: ReviewWriteFormProps) {
  const userId = getCurrentUserId();
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addReview({
      transactionId: transaction.id,
      productId: transaction.productId,
      reviewerId: userId,
      targetUserId,
      role,
      rating,
      tags,
      comment: comment.trim(),
    });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <p className="text-[14px] text-sam-muted">
        {productTitle && <span className="font-medium">{productTitle}</span>}
        {productTitle && " · "}
        {targetLabel}에게 후기를 남겨 주세요.
      </p>
      <div>
        <p className="mb-2 text-[13px] font-medium text-sam-fg">평점</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRating(r)}
              className={`rounded border px-2 py-1 text-[14px] ${
                rating >= r
                  ? "border-signature bg-signature/10 text-signature"
                  : "border-sam-border text-sam-meta"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-sam-fg">태그 (선택)</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3 py-1.5 text-[12px] ${
                tags.includes(tag)
                  ? "border-signature bg-signature/10 text-signature"
                  : "border-sam-border text-sam-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[13px] font-medium text-sam-fg">
          한줄 코멘트 (선택)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="거래는 어떠셨나요?"
          rows={3}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px] text-sam-fg"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-ui-rect border border-sam-border px-4 py-2.5 text-[14px] text-sam-muted"
        >
          취소
        </button>
        <button
          type="submit"
          className="flex-1 rounded-ui-rect bg-signature py-2.5 text-[14px] font-medium text-white"
        >
          후기 남기기
        </button>
      </div>
    </form>
  );
}
