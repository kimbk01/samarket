"use client";

/**
 * 거래 후기 조치 (거래 Admin 설계 v2 §D-5) — 숨김·복구는 사유 입력 + 2단계 확인 (표준 조치 시트).
 * 예전의 「신고검토 이동 (placeholder)」·「신뢰도 재계산 (로그만)」 버튼은 실제 처리가 없어 제거했다.
 */
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  const [sheet, setSheet] = useState<"hide_review" | "restore_review" | "dispute_accept" | "dispute_reject" | null>(null);
  const hidden = review.reviewStatus === "hidden";
  const disputed = review.ratingStatus === "disputed";
  const sheetTitle =
    sheet === "hide_review"
      ? t("admin_reviews_hide_title")
      : sheet === "restore_review"
        ? t("admin_reviews_restore_title")
        : sheet === "dispute_accept"
          ? t("admin_reviews_dispute_accept")
          : t("admin_reviews_dispute_reject");

  return (
    <div className="space-y-3">
      {disputed ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body-secondary text-sam-fg">
          <p className="font-semibold">{t("admin_reviews_dispute_pending")}</p>
          <p className="mt-1 text-sam-muted">
            {review.disputeReason ?? "—"}
            {review.disputeNote ? ` · ${review.disputeNote}` : ""}
          </p>
        </div>
      ) : review.disputeDecision ? (
        <p className="sam-text-helper text-sam-muted">
          {t(review.disputeDecision === "accepted" ? "admin_reviews_dispute_accepted" : "admin_reviews_dispute_rejected")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {disputed ? (
          <>
            <AdminActionButton variant="secondary" onClick={() => setSheet("dispute_accept")}>
              {t("admin_reviews_dispute_accept")}
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => setSheet("dispute_reject")}>
              {t("admin_reviews_dispute_reject")}
            </AdminActionButton>
          </>
        ) : null}
        {!hidden ? (
          <AdminActionButton variant="danger" onClick={() => setSheet("hide_review")}>
            {t("admin_reviews_action_hide")}
          </AdminActionButton>
        ) : (
          <AdminActionButton variant="secondary" onClick={() => setSheet("restore_review")}>
            {t("admin_reviews_action_restore")}
          </AdminActionButton>
        )}
        {review.targetUserId ? (
          <Link
            href={`/admin/trade/members/${encodeURIComponent(review.targetUserId)}`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            {t("admin_reviews_action_view_target_member")}
          </Link>
        ) : null}
      </div>

      {sheet ? (
        <CommunityActionSheet
          title={sheetTitle}
          rows={[
            { label: t("admin_reviews_row_review"), value: review.comment || "—" },
            { label: t("admin_reviews_row_target_member"), value: review.targetNickname || "—" },
          ]}
          reason={{ minLength: 2, placeholder: t("admin_reviews_reason_placeholder") }}
          destructive={sheet === "hide_review"}
          confirmLabel={
            sheet === "hide_review"
              ? t("admin_reviews_hide_btn")
              : sheet === "restore_review"
                ? t("admin_reviews_restore_btn")
                : sheetTitle
          }
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
