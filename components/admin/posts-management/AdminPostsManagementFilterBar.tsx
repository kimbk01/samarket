"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DEAL_TYPE_FILTER_VALUES,
  STATUS_FILTER_VALUES_POSTS,
  SORT_FILTER_VALUES_POSTS,
  getCategoryOptionsFromProducts,
  type PostsManagementFilters,
  type PostsManagementSortKey,
  type PostsManagementTab,
} from "@/lib/admin-products/posts-management-utils";
import type { Product, ProductStatus } from "@/lib/types/product";
import {
  POSTS_MGMT_DEAL_LABEL_KEY,
  POSTS_MGMT_SORT_LABEL_KEY,
  POSTS_MGMT_STATUS_LABEL_KEY,
} from "./posts-management-i18n";

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
  const { t } = useI18n();
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
            <option value="">{t("admin_posts_mgmt_job_listing_all")}</option>
            <option value="hire">{t("admin_posts_mgmt_job_listing_hire")}</option>
            <option value="work">{t("admin_posts_mgmt_job_listing_work")}</option>
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
          {DEAL_TYPE_FILTER_VALUES.map((value) => (
            <option key={value} value={value}>
              {t(POSTS_MGMT_DEAL_LABEL_KEY[value])}
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
          {STATUS_FILTER_VALUES_POSTS.map((value) => (
            <option key={value || "all"} value={value}>
              {t(POSTS_MGMT_STATUS_LABEL_KEY[value])}
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
          {t("admin_posts_mgmt_filter_has_report")}
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
          {t("admin_posts_mgmt_filter_hidden_only")}
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
          {t("admin_posts_mgmt_filter_banned_suspect")}
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
          {t("admin_posts_mgmt_filter_web_visible_only")}
        </label>
        <label className="flex items-center gap-1.5 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={showProductIdColumn}
            onChange={(e) => onShowProductIdColumnChange(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_posts_mgmt_filter_show_product_id_col")}
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
          {SORT_FILTER_VALUES_POSTS.map((value) => (
            <option key={value} value={value}>
              {t(POSTS_MGMT_SORT_LABEL_KEY[value])}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder={t("admin_posts_mgmt_placeholder_product_id")}
          value={productIdSearch}
          onChange={(e) => onProductIdSearchChange(e.target.value)}
          className="min-w-[200px] rounded border border-sam-border bg-sam-surface px-3 py-2 font-mono sam-text-body-secondary text-sam-fg placeholder:text-sam-meta"
        />
        <input
          type="text"
          placeholder={t("admin_posts_mgmt_placeholder_seller")}
          value={sellerSearch}
          onChange={(e) => onSellerSearchChange(e.target.value)}
          className="min-w-[160px] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
        />
        <select
          value={categorySearch}
          onChange={(e) => onCategorySearchChange(e.target.value)}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          <option value="">{t("admin_posts_mgmt_category_all")}</option>
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
