"use client";

import { useState } from "react";
import type { ReviewRoleType, PublicReviewType } from "@/lib/types/daangn";
import { submitTransactionReviewDaangn } from "@/lib/reviews/submitTransactionReviewDaangn";

const PUBLIC_OPTIONS: { value: PublicReviewType; label: string }[] = [
  { value: "good", label: "좋아요" },
  { value: "normal", label: "보통" },
  { value: "bad", label: "별로예요" },
];

interface ReviewFormProps {
  productId: string;
  roomId: string;
  revieweeId: string;
  revieweeLabel: string;
  roleType: ReviewRoleType;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReviewForm({
  productId,
  roomId,
  revieweeId,
  revieweeLabel,
  roleType,
  onSuccess,
  onCancel,
}: ReviewFormProps) {
  const [publicType, setPublicType] = useState<PublicReviewType>("good");
  const [anonymousNegative, setAnonymousNegative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await submitTransactionReviewDaangn({
      productId,
      roomId,
      revieweeId,
      roleType,
      publicReviewType: publicType,
      isAnonymousNegative: publicType === "bad" || anonymousNegative,
    });
    setLoading(false);
    if (res.ok) onSuccess();
    else setError(res.error);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <p className="sam-text-body text-sam-muted">
        <strong>{revieweeLabel}</strong>님에 대한 거래 후기를 남겨주세요. (1회만 가능)
      </p>
      <div className="mt-4">
        <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">평가</p>
        <div className="flex gap-2">
          {PUBLIC_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="publicType"
                value={opt.value}
                checked={publicType === opt.value}
                onChange={() => setPublicType(opt.value)}
                className="rounded border-sam-border"
              />
              <span className="sam-text-body-secondary text-sam-fg">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
      {(publicType === "bad" || publicType === "normal") && (
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={anonymousNegative}
            onChange={(e) => setAnonymousNegative(e.target.checked)}
            className="rounded border-sam-border"
          />
          <span className="sam-text-helper text-sam-muted">부정/비매너 평가는 상대방에게 익명으로 표시</span>
        </label>
      )}
      {error && <p className="mt-2 sam-text-body-secondary text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body text-sam-fg"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {loading ? "등록 중..." : "후기 보내기"}
        </button>
      </div>
    </form>
  );
}
