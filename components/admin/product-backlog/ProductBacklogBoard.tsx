"use client";

import { useMemo, useState } from "react";
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

const STATUS_COLUMNS: ProductBacklogStatus[] = [
  "inbox",
  "triaged",
  "planned",
  "in_progress",
  "released",
];

export function ProductBacklogBoard() {
  const { t } = useI18n();
  const [categoryFilter, setCategoryFilter] = useState<ProductFeedbackCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<ProductBacklogStatus | "">("");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_category")}
        </span>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter((e.target.value || "") as ProductFeedbackCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_product_backlog_label_status")}
        </span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as ProductBacklogStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {PRODUCT_BACKLOG_BOARD_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {allItems.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_product_backlog_empty_backlog")}
        </div>
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
