"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getProductBacklogItems } from "@/lib/product-backlog/product-backlog-state";
import { ProductBacklogCard } from "./ProductBacklogCard";
import {
  getBacklogStatusLabel,
  PRODUCT_BACKLOG_BOARD_STATUS_FILTER_OPTIONS,
  PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS,
} from "@/lib/product-backlog/product-backlog-utils";
import type {
  ProductBacklogStatus,
  ProductFeedbackCategory,
} from "@/lib/types/product-backlog";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const STATUS_COLUMNS: ProductBacklogStatus[] = [
  "inbox",
  "triaged",
  "planned",
  "in_progress",
  "released",
];

const FILTER_EXTRAS = ["category"] as const;

export function ProductBacklogBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const categoryFilter = lq.query.extras.category as ProductFeedbackCategory | "";
  const statusFilter = lq.query.status as ProductBacklogStatus | "";

  const allItems = useMemo(
    () =>
      getProductBacklogItems({
        ...(categoryFilter ? { category: categoryFilter } : {}),
      }),
    [categoryFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<ProductBacklogStatus, typeof allItems> = {
      inbox: [],
      triaged: [],
      planned: [],
      in_progress: [],
      released: [],
      rejected: [],
      archived: [],
    };
    allItems.forEach((i) => {
      if (i.status in map) map[i.status as ProductBacklogStatus].push(i);
    });
    return map;
  }, [allItems]);

  const columnsToShow = statusFilter ? [statusFilter] : STATUS_COLUMNS;

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
          {PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_product_backlog_label_status")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          {PRODUCT_BACKLOG_BOARD_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      {allItems.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_product_backlog_empty_backlog")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <div className="grid gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {columnsToShow.map((status) => (
            <div
              key={status}
              className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
            >
              <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                {getBacklogStatusLabel(t, status)}
                <span className="ml-1 text-sam-muted">
                  ({byStatus[status]?.length ?? 0})
                </span>
              </h3>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((item) => (
                  <ProductBacklogCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
