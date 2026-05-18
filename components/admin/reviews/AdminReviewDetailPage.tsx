"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCallback, useState, useEffect } from "react";
import type { AdminReview } from "@/lib/types/admin-review";
import { fetchAdminTransactionReviewOne } from "@/lib/admin-reviews/fetch-admin-transaction-reviews";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import {
  REVIEW_PUBLIC_TYPE_KEYS,
  REVIEW_ROLE_KEYS,
} from "@/components/admin/i18n/admin-review-label-keys";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminReviewStatusBadge } from "./AdminReviewStatusBadge";
import { AdminReviewActionPanel } from "./AdminReviewActionPanel";
import { AdminReviewModerationLogList } from "./AdminReviewModerationLogList";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

interface AdminReviewDetailPageProps {
  reviewId: string;
}

export function AdminReviewDetailPage({ reviewId }: AdminReviewDetailPageProps) {
  const { t } = useI18n();
  const [review, setReview] = useState<AdminReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const user = getCurrentUser();
    const uid = user?.id?.trim() ?? "";
    if (!uid || !isAdminUser(user)) {
      setReview(null);
      setLoadError("관리자만 조회할 수 있습니다.");
      setLoading(false);
      return;
    }
    const data = await fetchAdminTransactionReviewOne(reviewId);
    setReview(data ?? null);
    setLoading(false);
  }, [reviewId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  if (loading && !review) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-8 text-center sam-text-body text-amber-800">
        {loadError}
      </div>
    );
  }

  if (!review) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        리뷰를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_review_k6bcc08b0" backHref="/admin/reviews" />

      <AdminCard titleKey="admin_review_kdd766933">
        <div className="space-y-2 sam-text-body">
          <p className="font-semibold text-sam-fg">{review.productTitle}</p>
          <p className="text-sam-muted">{t("admin_review_tx_id")}: {review.transactionId}</p>
          <AdminReviewStatusBadge status={review.reviewStatus} className="mt-1" />
          <p className="text-sam-muted">
            {t("admin_review_public_label")}:{" "}
            {t(REVIEW_PUBLIC_TYPE_KEYS[review.publicReviewType ?? "normal"] ?? "admin_review_public_normal")} ·{" "}
            {t("admin_review_rating_label")} {review.rating} · {t("admin_review_role_label")}{" "}
            {t(REVIEW_ROLE_KEYS[review.role])}
          </p>
          {review.isAnonymousNegative ? (
            <p className="sam-text-body-secondary text-sam-muted">{t("admin_review_k9713b481")}</p>
          ) : null}
          {(review.positiveTagKeys?.length || review.negativeTagKeys?.length || review.privateTags?.length) && (
            <div className="space-y-1 text-sam-muted">
              {!!review.positiveTagKeys?.length && (
                <p>{t("admin_review_positive_tags")}: {formatAdminReviewTagKeys(t, review.role, review.positiveTagKeys)}</p>
              )}
              {!!review.negativeTagKeys?.length && (
                <p>{t("admin_review_negative_tags")}: {formatAdminReviewTagKeys(t, review.role, review.negativeTagKeys)}</p>
              )}
              {!!review.privateTags?.length && (
                <p>{t("admin_review_legacy_tags")}: {review.privateTags.join(", ")}</p>
              )}
            </div>
          )}
          {review.transactionId ? (
            <p className="sam-text-body-secondary text-signature">
              <a href={tradeChatNotificationHref(review.transactionId, "product_chat")} target="_blank" rel="noreferrer" className="hover:underline">
                {t("admin_review_open_chat")}
              </a>
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sam-fg">{review.comment || "—"}</p>
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_review_created_at")}: {new Date(review.createdAt).toLocaleString("ko-KR")}
          </p>
          {review.reportCount > 0 && (
            <p className="text-amber-700">{t("admin_review_report_count")}: {review.reportCount}</p>
          )}
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_review_kb2119cce">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_review_k0be45e6f")}</dt>
            <dd>
              {review.reviewerNickname} ({review.reviewerId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_review_k4ae32adf")}</dt>
            <dd>
              {review.targetNickname} ({review.targetUserId})
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_review_admin_3">
        <AdminReviewActionPanel review={review} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard titleKey="admin_review_k5c775cd8">
        <AdminReviewModerationLogList logs={[]} />
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("admin_review_kf41d33ec")}</p>
      </AdminCard>
    </div>
  );
}
