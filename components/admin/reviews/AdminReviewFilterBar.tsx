"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReviewRole, ReviewStatus } from "@/lib/types/review";
import {
  REVIEW_STATUS_FILTER_OPTIONS,
  RATING_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
  type AdminReviewFilters,
} from "@/lib/admin-reviews/admin-review-utils";

interface AdminReviewFilterBarProps {
  filters: AdminReviewFilters;
  searchQuery: string;
  onFiltersChange: (f: AdminReviewFilters) => void;
  onSearchChange: (q: string) => void;
}

export function AdminReviewFilterBar({
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
}: AdminReviewFilterBarProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder={t("admin_review_search_placeholder")}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[200px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
      />
      <select
        value={filters.reviewStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            reviewStatus: e.target.value as ReviewStatus | "",
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {REVIEW_STATUS_FILTER_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={filters.rating}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            rating: e.target.value === "" ? "" : Number(e.target.value),
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {RATING_FILTER_OPTIONS.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={filters.role}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            role: e.target.value as ReviewRole | "",
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {ROLE_FILTER_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
