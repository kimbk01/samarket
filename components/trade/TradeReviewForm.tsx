"use client";

import { useState } from "react";
import type { ReviewRoleType, PublicReviewType } from "@/lib/types/daangn";
import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  SELLER_TO_BUYER_NEGATIVE,
  SELLER_TO_BUYER_POSITIVE,
} from "@/lib/trade/trade-review-tags";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { dispatchWrittenReviewUpdated } from "@/lib/mypage/written-review-events";

const PUBLIC_OPTIONS: { value: PublicReviewType; label: string }[] = [
  { value: "good", label: "좋아요" },
  { value: "normal", label: "보통" },
  { value: "bad", label: "별로예요" },
];

interface TradeReviewFormProps {
  effectiveProductChatId: string;
  productId: string;
  revieweeId: string;
  revieweeLabel: string;
  roleType: ReviewRoleType;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TradeReviewForm({
  effectiveProductChatId,
  productId,
  revieweeId,
  revieweeLabel,
  roleType,
  onSuccess,
  onCancel,
}: TradeReviewFormProps) {
  const [publicType, setPublicType] = useState<PublicReviewType>("good");
  const [pos, setPos] = useState<Set<string>>(new Set());
  const [neg, setNeg] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [anonymousNegative, setAnonymousNegative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const posOpts =
    roleType === "buyer_to_seller" ? BUYER_TO_SELLER_POSITIVE : SELLER_TO_BUYER_POSITIVE;
  const negOpts =
    roleType === "buyer_to_seller" ? BUYER_TO_SELLER_NEGATIVE : SELLER_TO_BUYER_NEGATIVE;

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user?.id) {
      setError("로그인이 필요합니다.");
      return;
    }
    setLoading(true);
    setError("");
    const path = `/api/trade/product-chat/${encodeURIComponent(effectiveProductChatId)}/submit-review`;
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revieweeId,
          roleType,
          publicReviewType: publicType,
          positiveTagKeys: [...pos],
          negativeTagKeys: [...neg],
          comment,
          isAnonymousNegative: publicType === "bad" || anonymousNegative,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      dispatchWrittenReviewUpdated();
      onSuccess();
    } catch {
      setError("네트워크 오류입니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-2 pb-2">
      <p className="sam-text-body text-sam-muted">
        <strong>{revieweeLabel}</strong>님에 대한 거래 후기 (1회)
      </p>

      <div className="mt-3">
        <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">총평</p>
        <div className="flex flex-wrap gap-2">
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

      <div className="mt-3">
        <p className="mb-1.5 sam-text-helper font-medium text-sam-fg">긍정 항목 (복수)</p>
        <div className="flex flex-wrap gap-2">
          {posOpts.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => toggle(pos, o.key, setPos)}
              className={`rounded-ui-rect border px-2.5 py-1 text-[11px] font-medium ${
                pos.has(o.key)
                  ? "border-signature bg-signature/5 text-sam-fg"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 sam-text-helper font-medium text-sam-fg">부정 항목 (복수, 상대에게 일부 비공개)</p>
        <div className="flex flex-wrap gap-2">
          {negOpts.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => toggle(neg, o.key, setNeg)}
              className={`rounded-ui-rect border px-2.5 py-1 text-[11px] font-medium ${
                neg.has(o.key)
                  ? "border-amber-500 bg-amber-50 text-amber-900"
                  : "border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="sam-text-helper font-medium text-sam-fg">한줄 코멘트 (선택)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 200))}
          rows={2}
          className="sam-textarea mt-1 min-h-[96px] w-full"
          placeholder="짧게 남겨 주세요"
        />
      </div>

      {(publicType === "bad" || publicType === "normal") && (
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={anonymousNegative}
            onChange={(e) => setAnonymousNegative(e.target.checked)}
            className="rounded border-sam-border"
          />
          <span className="sam-text-helper text-sam-muted">부정 평가는 상대에게 익명으로 표시</span>
        </label>
      )}
      </div>

      <div className="shrink-0 border-t border-sam-border-soft bg-sam-surface px-4 py-3 shadow-[0_-4px_14px_rgba(0,0,0,0.06)] safe-area-pb">
        {error ? <p className="mb-2 sam-text-body-secondary text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="sam-btn-secondary flex-1"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="sam-btn-primary flex-1 disabled:opacity-50"
          >
            {loading ? "등록 중..." : "후기 등록"}
          </button>
        </div>
      </div>
    </form>
  );
}
