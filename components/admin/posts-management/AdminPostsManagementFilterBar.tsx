"use client";

import {
  DEAL_TYPE_OPTIONS,
  STATUS_OPTIONS_POSTS,
  SORT_OPTIONS_POSTS,
  getCategoryOptionsFromProducts,
  type PostsManagementFilters,
  type PostsManagementSortKey,
  type PostsManagementTab,
} from "@/lib/admin-products/posts-management-utils";
import type { Product, ProductStatus } from "@/lib/types/product";

export interface AdminPostsManagementFilterBarProps {
  tab: PostsManagementTab;
  filters: PostsManagementFilters;
  products: Product[];
  sellerSearch: string;
  categorySearch: string;
  productIdSearch: string;
  showProductIdColumn: boolean;
  onFiltersChange: (f: PostsManagementFilters) => void;
  onSellerSearchChange: (q: string) => void;
  onCategorySearchChange: (q: string) => void;
  onProductIdSearchChange: (q: string) => void;
  onShowProductIdColumnChange: (show: boolean) => void;
}

export function AdminPostsManagementFilterBar({
  tab,
  filters,
  products,
  sellerSearch,
  categorySearch,
  productIdSearch,
  showProductIdColumn,
  onFiltersChange,
  onSellerSearchChange,
  onCategorySearchChange,
  onProductIdSearchChange,
  onShowProductIdColumnChange,
}: AdminPostsManagementFilterBarProps) {
  const categories = getCategoryOptionsFromProducts(products);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tab === "jobs" ? (
          <select
            value={filters.jobListingKind}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                jobListingKind: e.target.value as "" | "hire" | "work",
              })
            }
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            <option value="">구인·구직 전체</option>
            <option value="hire">사람 구해요</option>
            <option value="work">일 찾고 있어요</option>
          </select>
        ) : null}
        <select
          value={filters.dealType}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              dealType: e.target.value as "all" | "sale" | "free",
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {DEAL_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: e.target.value as ProductStatus | "",
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {STATUS_OPTIONS_POSTS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={filters.hasReport}
            onChange={(e) =>
              onFiltersChange({ ...filters, hasReport: e.target.checked })
            }
            className="rounded border-sam-border"
          />
          신고 있음
        </label>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={filters.hiddenOnly}
            onChange={(e) =>
              onFiltersChange({ ...filters, hiddenOnly: e.target.checked })
            }
            className="rounded border-sam-border"
          />
          숨김 상품
        </label>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={filters.bannedSuspect}
            onChange={(e) =>
              onFiltersChange({ ...filters, bannedSuspect: e.target.checked })
            }
            className="rounded border-sam-border"
          />
          금지의심 상품
        </label>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={filters.webVisibleOnly}
            onChange={(e) =>
              onFiltersChange({ ...filters, webVisibleOnly: e.target.checked })
            }
            className="rounded border-sam-border"
          />
          웹 노출만
        </label>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={showProductIdColumn}
            onChange={(e) => onShowProductIdColumnChange(e.target.checked)}
            className="rounded border-sam-border"
          />
          상품 ID 열 표시
        </label>
        <select
          value={filters.sortKey}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              sortKey: e.target.value as PostsManagementSortKey,
            })
          }
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {SORT_OPTIONS_POSTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder="상품 ID 검색 (일부 UUID)"
          value={productIdSearch}
          onChange={(e) => onProductIdSearchChange(e.target.value)}
          className="min-w-[200px] rounded border border-sam-border bg-sam-surface px-3 py-2 font-mono sam-text-body-secondary text-sam-fg placeholder:text-sam-meta"
        />
        <input
          type="text"
          placeholder="특정 판매자 검색"
          value={sellerSearch}
          onChange={(e) => onSellerSearchChange(e.target.value)}
          className="min-w-[160px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={categorySearch}
          onChange={(e) => onCategorySearchChange(e.target.value)}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          <option value="">특정 카테고리 전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
