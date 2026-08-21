"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminBusinessOpsFilterBar,
  DEFAULT_OPS_FILTERS,
  type AdminBusinessOpsFilters,
} from "./AdminBusinessFilterBar";
import { AdminBusinessTable } from "./AdminBusinessTable";
import type {
  AdminBusinessListOpsKpi,
  AdminBusinessListOpsRow,
} from "@/lib/admin-business/load-admin-business-list";

export function AdminBusinessListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminBusinessOpsFilters>(DEFAULT_OPS_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [rows, setRows] = useState<AdminBusinessListOpsRow[]>([]);
  const [kpi, setKpi] = useState<AdminBusinessListOpsKpi | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filterOptions, setFilterOptions] = useState<{
    categories: { id: string; name: string }[];
    regions: string[];
  }>({ categories: [], regions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    filters.approval,
    filters.open,
    filters.orderable,
    filters.delivery,
    filters.settlement,
    filters.report,
    filters.restriction,
    filters.category_id,
    filters.region,
    filters.sort,
  ]);

  const qs = useMemo(() => {
    const parts = new URLSearchParams();
    parts.set("page", String(page));
    parts.set("pageSize", "20");
    parts.set("sort", filters.sort || "last_order");
    if (debouncedQ) parts.set("q", debouncedQ);
    if (filters.approval && filters.approval !== "all") parts.set("approval", filters.approval);
    if (filters.open) parts.set("open", filters.open);
    if (filters.orderable) parts.set("orderable", filters.orderable);
    if (filters.delivery) parts.set("delivery", filters.delivery);
    if (filters.settlement) parts.set("settlement", filters.settlement);
    if (filters.report) parts.set("report", filters.report);
    if (filters.restriction) parts.set("restriction", filters.restriction);
    if (filters.category_id) parts.set("category_id", filters.category_id);
    if (filters.region) parts.set("region", filters.region);
    return `?${parts.toString()}`;
  }, [filters, debouncedQ, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/business/ops-list${qs}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        stores?: AdminBusinessListOpsRow[];
        kpi?: AdminBusinessListOpsKpi;
        total?: number;
        pageSize?: number;
        filterOptions?: {
          categories: { id: string; name: string }[];
          regions: string[];
        };
      };
      if (j.ok) {
        setRows(Array.isArray(j.stores) ? j.stores : []);
        setKpi(j.kpi ?? null);
        setTotal(typeof j.total === "number" ? j.total : 0);
        setPageSize(typeof j.pageSize === "number" ? j.pageSize : 20);
        setFilterOptions(j.filterOptions ?? { categories: [], regions: [] });
      } else {
        setRows([]);
        setKpi(null);
        setTotal(0);
      }
    } catch {
      setRows([]);
      setKpi(null);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_list" />
      <AdminBusinessOpsFilterBar
        filters={filters}
        onChange={setFilters}
        kpi={kpi}
        filterOptions={filterOptions}
        resultCount={total}
        loading={loading}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-white py-12 text-center sam-text-body text-sam-muted shadow-sm">
          {t("admin_biz_empty_list")}
        </div>
      ) : (
        <>
          <AdminBusinessTable rows={rows} viewMode={viewMode} />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-white px-4 py-3 shadow-sm">
            <p className="sam-text-helper text-sam-muted">
              {t("admin_biz_ops_page_range", {
                from: String(from),
                to: String(to),
                total: String(total),
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 sam-text-helper disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("admin_biz_ops_page_prev")}
              </button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const p =
                  pages <= 7
                    ? i + 1
                    : Math.min(Math.max(page - 3, 1), Math.max(pages - 6, 1)) + i;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`min-w-8 rounded-ui-rect px-2 py-1.5 sam-text-helper ${
                      p === page
                        ? "bg-signature text-white"
                        : "border border-sam-border bg-sam-app text-sam-fg"
                    }`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={page >= pages}
                className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1.5 sam-text-helper disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                {t("admin_biz_ops_page_next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
