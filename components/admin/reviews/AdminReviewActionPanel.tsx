"use client";

/**
 * 거래 후기 조치 (거래 Admin 설계 v2 §D-5) — 숨김·복구는 사유 입력 + 2단계 확인 (표준 조치 시트).
 * 예전의 「신고검토 이동 (placeholder)」·「신뢰도 재계산 (로그만)」 버튼은 실제 처리가 없어 제거했다.
 */
import { useState } from "react";
import Link from "next/link";
import type { AdminReview } from "@/lib/types/admin-review";
import {
  CommunityActionSheet,
  communitySheetFetch,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface AdminReviewActionPanelProps {
  review: AdminReview;
  onActionSuccess: () => void;
}

export function AdminReviewActionPanel({ review, onActionSuccess }: AdminReviewActionPanelProps) {
  const [sheet, setSheet] = useState<"hide_review" | "restore_review" | null>(null);
  const hidden = review.reviewStatus === "hidden";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!hidden ? (
          <AdminActionButton variant="danger" onClick={() => setSheet("hide_review")}>
            후기 숨김
          </AdminActionButton>
        ) : (
          <AdminActionButton variant="secondary" onClick={() => setSheet("restore_review")}>
            후기 복구
          </AdminActionButton>
        )}
        {review.targetUserId ? (
          <Link
            href={`/admin/trade/members/${encodeURIComponent(review.targetUserId)}`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            대상 회원 보기
          </Link>
        ) : null}
      </div>

      {sheet ? (
        <CommunityActionSheet
          title={sheet === "hide_review" ? "후기 숨김" : "후기 복구"}
          rows={[{ label: "후기", value: review.comment || "—" }, { label: "대상 회원", value: review.targetNickname || "—" }]}
          reason={{ minLength: 2, placeholder: "사유 (2자 이상)" }}
          destructive={sheet === "hide_review"}
          confirmLabel={sheet === "hide_review" ? "숨김" : "복구"}
          onSubmit={(reason) =>
            communitySheetFetch(`/api/admin/transaction-reviews/${encodeURIComponent(review.id)}/action`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: sheet, note: reason }),
            })
          }
          onClose={() => setSheet(null)}
          onSettled={() => {
            setSheet(null);
            onActionSuccess();
          }}
        />
      ) : null}
    </div>
  );
}
