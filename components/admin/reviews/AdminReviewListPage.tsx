"use client";

/**
 * 거래 후기 목록 `/admin/reviews` — 조건·쪽은 URL 에 두고 서버가 적용한다 (총 건수 표시).
 * URL: status(노출 상태) · rating · role · q · page · size(20/50/100, 기본 50)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useEffect, useState } from "react";
import type { AdminReview } from "@/lib/types/admin-review";
import {
  AdminReviewFetchError,
  fetchAdminTransactionReviewsPage,
} from "@/lib/admin-reviews/fetch-admin-transaction-reviews";
import {
  RATING_FILTER_OPTIONS,
  REVIEW_STATUS_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
} from "@/lib/admin-reviews/admin-review-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListPagination,
  CommunitySelect,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminReviewTable } from "./AdminReviewTable";

type LoadState =
  | { status: "loading"; reviews: AdminReview[] | null; total: number | null }
  | { status: "ok"; reviews: AdminReview[]; total: number }
  | { status: "error"; code: string; httpStatus: number };

const FILTER_KEYS = ["status", "rating", "role", "q"] as const;

export function AdminReviewListPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const reviewStatus = qs.get("status");
  const rating = qs.get("rating");
  const role = qs.get("role");
  const q = qs.get("q");
  const { limit, offset } = qs.limitOffset;

  const [state, setState] = useState<LoadState>({ status: "loading", reviews: null, total: null });
  const [tick, setTick] = useState(0);
  const reload = () => setTick((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    setState((s) =>
      s.status === "ok" ? { status: "loading", reviews: s.reviews, total: s.total } : { status: "loading", reviews: null, total: null }
    );
    void (async () => {
      try {
        const r = await fetchAdminTransactionReviewsPage({ limit, offset, reviewStatus, rating, role, q });
        if (!cancelled) setState({ status: "ok", reviews: r.reviews, total: r.total });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AdminReviewFetchError) setState({ status: "error", code: err.code, httpStatus: err.status });
        else setState({ status: "error", code: "network_error", httpStatus: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, offset, reviewStatus, rating, role, q, tick]);

  const reviews = state.status === "error" ? [] : state.reviews ?? [];
  const total = state.status === "ok" ? state.total : null;

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
      <CommunityFilterBar
        ko={ko}
        searchPlaceholder={t("admin_review_search_placeholder")}
        status={{
          key: "status",
          options: REVIEW_STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
        }}
        onRefresh={reload}
        pending={state.status === "loading"}
      >
        <CommunityFilterField label={ko ? "평가" : "Rating"}>
          <CommunitySelect
            name="rating"
            value={rating}
            onChange={(v) => qs.set({ rating: v || null })}
            options={RATING_FILTER_OPTIONS.map((o) => ({ value: String(o.value), label: t(o.labelKey) }))}
          />
        </CommunityFilterField>
        <CommunityFilterField label={ko ? "작성 방향" : "Direction"}>
          <CommunitySelect
            name="role"
            value={role}
            onChange={(v) => qs.set({ role: v || null })}
            options={ROLE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          />
        </CommunityFilterField>
      </CommunityFilterBar>
      {state.status === "error" ? (
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : state.status === "loading" && !state.reviews ? (
        <AdminLoadingState ko={ko} />
      ) : reviews.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={ko ? "조건에 맞는 리뷰가 없습니다." : "No reviews match the filters."}
          onReset={qs.hasAny(FILTER_KEYS) ? () => qs.reset() : undefined}
        />
      ) : (
        <AdminReviewTable reviews={reviews} />
      )}
      <CommunityListPagination q={qs} total={total} disabled={state.status === "loading"} />
    </div>
  );
}
