"use client";

import { useState } from "react";
import type { AdminReview } from "@/lib/types/admin-review";

interface AdminReviewActionPanelProps {
  review: AdminReview;
  onActionSuccess: () => void;
}

export function AdminReviewActionPanel({
  review,
  onActionSuccess,
}: AdminReviewActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (
    action: "hide_review" | "restore_review" | "review_only" | "recalculate_trust"
  ) => {
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/transaction-reviews/${encodeURIComponent(review.id)}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "처리에 실패했습니다.");
        return;
      }
      onActionSuccess();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {review.reviewStatus !== "hidden" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void run("hide_review")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "hide_review" ? "처리 중..." : "리뷰 숨김"}
          </button>
        )}
        {review.reviewStatus === "hidden" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void run("restore_review")}
            className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2 sam-text-body-secondary font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "restore_review" ? "처리 중..." : "리뷰 복구"}
          </button>
        )}
        <a
          href={`/admin/reports?targetType=user&targetId=${review.targetUserId}`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
        >
          리뷰 신고검토 이동 (placeholder)
        </a>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void run("recalculate_trust")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {loading === "recalculate_trust" ? "처리 중..." : "신뢰도 재계산 (로그만)"}
        </button>
      </div>
    </div>
  );
}
