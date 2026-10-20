"use client";

/**
 * 거래 후기 목록 `/admin/reviews` — 마이페이지 「후기」와 같은 `transaction_reviews` 를 관리자 API(GET
 * `/api/admin/transaction-reviews`)로 읽는다. 필터·검색·페이지는 서버(R7 목록 표준 — 예전 500건 상한 없음).
 * URL: q · status · rating · role · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminReview } from "@/lib/types/admin-review";
import {
  REVIEW_STATUS_FILTER_OPTIONS,
  RATING_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
} from "@/lib/admin-reviews/admin-review-utils";
import {
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminReviewTable } from "./AdminReviewTable";

const REVIEW_STATUSES = ["visible", "hidden", "reported"] as const;
const LIST_EXTRAS = ["rating", "role"] as const;

type ListResponse = { ok?: boolean; error?: string; reviews?: AdminReview[]; total?: number };

export function AdminReviewListPage() {
  const { t } = useI18n();
  const lq = useCommunityListQuery({ statuses: REVIEW_STATUSES, extras: LIST_EXTRAS });
  const { state, reload } = useCommunityAdminJson<ListResponse>(
    `/api/admin/transaction-reviews?${lq.apiParams({ period: false }).toString()}`
  );
  const reviews = state.data?.reviews ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  return (
    <CommunityListShell
      title={t("admin_review_kf2bb246c")}
      description="거래를 마친 회원이 서로 남긴 후기를 확인합니다."
      filterBar={
        <CommunityFilterBar
          lq={lq}
          showPeriod={false}
          searchPlaceholder={t("admin_review_search_placeholder")}
          pending={state.status === "loading"}
          status={{ options: REVIEW_STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })) }}
        >
          <CommunityFilterField label="별점">
            <CommunitySelect
              value={lq.query.extras.rating}
              onChange={(v) => lq.setExtra("rating", v)}
              options={RATING_FILTER_OPTIONS.map((o) => ({ value: String(o.value), label: t(o.labelKey) }))}
            />
          </CommunityFilterField>
          <CommunityFilterField label="작성 방향">
            <CommunitySelect
              value={lq.query.extras.role}
              onChange={(v) => lq.setExtra("role", v)}
              options={ROLE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            />
          </CommunityFilterField>
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={reviews.length === 0} lq={lq} onRetry={reload} emptyMessage="거래 후기가 없습니다.">
        <AdminReviewTable reviews={reviews} />
      </CommunityListBody>
    </CommunityListShell>
  );
}
