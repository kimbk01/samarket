"use client";

import { useCallback, useState, useEffect } from "react";
import type { AdminReview } from "@/lib/types/admin-review";
import { fetchAdminTransactionReviewOne } from "@/lib/admin-reviews/fetch-admin-transaction-reviews";
import { formatAdminReviewTagKeys } from "@/lib/admin-reviews/admin-review-utils";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminReviewStatusBadge } from "./AdminReviewStatusBadge";
import { AdminReviewActionPanel } from "./AdminReviewActionPanel";
import { AdminReviewModerationLogList } from "./AdminReviewModerationLogList";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";

const ROLE_LABELS: Record<string, string> = {
  buyer_to_seller: "구매자 → 판매자",
  seller_to_buyer: "판매자 → 구매자",
};

interface AdminReviewDetailPageProps {
  reviewId: string;
}

const PUBLIC_LABELS: Record<string, string> = {
  good: "좋아요",
  normal: "보통",
  bad: "별로",
};

export function AdminReviewDetailPage({ reviewId }: AdminReviewDetailPageProps) {
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
      <AdminPageHeader title="리뷰 상세" backHref="/admin/reviews" />

      <AdminCard title="리뷰 정보">
        <div className="space-y-2 sam-text-body">
          <p className="font-semibold text-sam-fg">{review.productTitle}</p>
          <p className="text-sam-muted">거래 ID: {review.transactionId}</p>
          <AdminReviewStatusBadge status={review.reviewStatus} className="mt-1" />
          <p className="text-sam-muted">
            공개 후기: {PUBLIC_LABELS[review.publicReviewType ?? "normal"] ?? review.publicReviewType} · 평점{" "}
            {review.rating} · 역할 {ROLE_LABELS[review.role] ?? review.role}
          </p>
          {review.isAnonymousNegative ? (
            <p className="sam-text-body-secondary text-sam-muted">익명 부정 후기: 예</p>
          ) : null}
          {(review.positiveTagKeys?.length || review.negativeTagKeys?.length || review.privateTags?.length) && (
            <div className="space-y-1 text-sam-muted">
              {!!review.positiveTagKeys?.length && (
                <p>긍정 태그: {formatAdminReviewTagKeys(review.role, review.positiveTagKeys)}</p>
              )}
              {!!review.negativeTagKeys?.length && (
                <p>부정 태그: {formatAdminReviewTagKeys(review.role, review.negativeTagKeys)}</p>
              )}
              {!!review.privateTags?.length && (
                <p>기타(레거시): {review.privateTags.join(", ")}</p>
              )}
            </div>
          )}
          {review.transactionId ? (
            <p className="sam-text-body-secondary text-signature">
              <a href={tradeChatNotificationHref(review.transactionId, "product_chat")} target="_blank" rel="noreferrer" className="hover:underline">
                채팅방 열기
              </a>
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sam-fg">{review.comment || "—"}</p>
          <p className="sam-text-body-secondary text-sam-muted">
            작성일: {new Date(review.createdAt).toLocaleString("ko-KR")}
          </p>
          {review.reportCount > 0 && (
            <p className="text-amber-700">신고 수: {review.reportCount}</p>
          )}
        </div>
      </AdminCard>

      <AdminCard title="작성자 / 대상자">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">작성자</dt>
            <dd>
              {review.reviewerNickname} ({review.reviewerId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">대상자</dt>
            <dd>
              {review.targetNickname} ({review.targetUserId})
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="관리자 액션">
        <AdminReviewActionPanel review={review} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard title="조치 이력">
        <AdminReviewModerationLogList logs={[]} />
        <p className="mt-2 sam-text-body-secondary text-sam-muted">조치 이력은 DB 연동 후 제공됩니다.</p>
      </AdminCard>
    </div>
  );
}
