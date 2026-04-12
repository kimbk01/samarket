"use client";

import type { ReviewRole, ReviewStatus } from "@/lib/types/review";
import {
  REVIEW_STATUS_OPTIONS,
  RATING_FILTER_OPTIONS,
  ROLE_OPTIONS,
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="상품명·작성자·대상자·거래 ID 검색"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="min-w-[200px] rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg placeholder:text-sam-meta"
      />
      <select
        value={filters.reviewStatus}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            reviewStatus: e.target.value as ReviewStatus | "",
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {REVIEW_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
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
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {RATING_FILTER_OPTIONS.map((o) => (
          <option key={o.value ?? "all"} value={o.value ?? ""}>
            {o.label}
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
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
