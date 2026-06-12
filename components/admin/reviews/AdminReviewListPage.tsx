"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState, useEffect, useCallback } from "react";
import type { AdminReview } from "@/lib/types/admin-review";
import { fetchAdminTransactionReviewsList } from "@/lib/admin-reviews/fetch-admin-transaction-reviews";
import {
  filterAndSortReviews,
  type AdminReviewFilters,
} from "@/lib/admin-reviews/admin-review-utils";
import { AdminReviewFetchError } from "@/lib/admin-reviews/fetch-admin-transaction-reviews";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminReviewFilterBar } from "./AdminReviewFilterBar";
import { AdminReviewTable } from "./AdminReviewTable";

const DEFAULT_FILTERS: AdminReviewFilters = {
  reviewStatus: "",
  rating: "",
  role: "",
  sortKey: "createdAt",
};

export function AdminReviewListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminReviewFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchAdminTransactionReviewsList();
      setReviews(list);
    } catch (err) {
      setReviews([]);
      if (err instanceof AdminReviewFetchError) {
        if (err.status === 401) setLoadError(t("common_login_required"));
        else if (err.status === 403) setLoadError(t("admin_api_err_forbidden"));
        else setLoadError(t("common_error"));
      } else {
        setLoadError(t("common_error"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterAndSortReviews(reviews, filters, searchQuery),
    [reviews, filters, searchQuery]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_review_kf2bb246c" />
      <p className="sam-text-body-secondary text-sam-muted">
        마이페이지 「후기」(
        <code className="rounded bg-sam-surface-muted px-1">/mypage/trade/reviews</code>)와 동일하게{" "}
        <code className="rounded bg-sam-surface-muted px-1">transaction_reviews</code> 테이블을 사용합니다. (
        <code className="rounded bg-sam-surface-muted px-1">GET /api/my/received-reviews</code> ·{" "}
        <code className="rounded bg-sam-surface-muted px-1">/api/my/written-reviews</code> ↔{" "}
        <code className="rounded bg-sam-surface-muted px-1">POST /api/admin/transaction-reviews</code>)
      </p>
      {loadError && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {loadError}
        </div>
      )}
      <AdminReviewFilterBar
        filters={filters}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchChange={setSearchQuery}
      />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          조건에 맞는 리뷰가 없습니다.
        </div>
      ) : (
        <AdminReviewTable reviews={filtered} />
      )}
    </div>
  );
}
