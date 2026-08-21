"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTableBottomHorizontalScroll } from "@/components/admin/AdminTableBottomHorizontalScroll";
import { readSidebarExpanded } from "@/lib/admin-ui-prefs";
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

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [tableClientWidth, setTableClientWidth] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

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

  const showTableScrollChrome = !loading && viewMode === "list" && rows.length > 0;

  const onTableHorizontalScroll = useCallback(() => {
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!tableEl || !bottomEl) return;
    if (bottomEl.scrollLeft !== tableEl.scrollLeft) bottomEl.scrollLeft = tableEl.scrollLeft;
  }, []);

  const onBottomHorizontalScroll = useCallback(() => {
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!tableEl || !bottomEl) return;
    if (tableEl.scrollLeft !== bottomEl.scrollLeft) tableEl.scrollLeft = bottomEl.scrollLeft;
  }, []);

  useEffect(() => {
    const syncSidebar = () => setSidebarExpanded(readSidebarExpanded());
    syncSidebar();
    window.addEventListener("storage", syncSidebar);
    window.addEventListener("focus", syncSidebar);
    return () => {
      window.removeEventListener("storage", syncSidebar);
      window.removeEventListener("focus", syncSidebar);
    };
  }, []);

  const measureTableScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el || !showTableScrollChrome) {
      setTableScrollWidth(0);
      setTableClientWidth(0);
      return;
    }
    setTableScrollWidth(el.scrollWidth);
    setTableClientWidth(el.clientWidth);
  }, [showTableScrollChrome]);

  useLayoutEffect(() => {
    if (!showTableScrollChrome) {
      setTableScrollWidth(0);
      setTableClientWidth(0);
      return;
    }
    measureTableScroll();
    const el = tableScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureTableScroll());
    ro.observe(el);
    window.addEventListener("resize", measureTableScroll);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureTableScroll);
    };
  }, [measureTableScroll, showTableScrollChrome, rows.length, viewMode, loading]);

  const showBottomFixedScroll =
    showTableScrollChrome && tableScrollWidth > tableClientWidth + 2;

  useEffect(() => {
    if (!showBottomFixedScroll) return;
    measureTableScroll();
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (tableEl && bottomEl) bottomEl.scrollLeft = tableEl.scrollLeft;
  }, [showBottomFixedScroll, measureTableScroll, tableScrollWidth]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`w-full min-w-0 max-w-full space-y-4${
        showBottomFixedScroll ? " pb-[4.5rem]" : ""
      }`}
    >
      <AdminPageHeader titleKey="admin_biz_page_list" />
      <div className="w-full min-w-0 max-w-full">
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
      </div>
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-white py-12 text-center sam-text-body text-sam-muted shadow-sm">
          {t("admin_biz_empty_list")}
        </div>
      ) : (
        <>
          <AdminBusinessTable
            ref={tableScrollRef}
            rows={rows}
            viewMode={viewMode}
            onHorizontalScroll={onTableHorizontalScroll}
          />
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-white px-4 py-3 shadow-sm">
            <p className="sam-text-helper text-sam-muted">
              {t("admin_biz_ops_page_range", {
                from: String(from),
                to: String(to),
                total: String(total),
              })}
            </p>
            <div className="flex flex-wrap items-center gap-1">
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

      <AdminTableBottomHorizontalScroll
        show={showBottomFixedScroll}
        tableScrollWidth={tableScrollWidth}
        bottomScrollRef={bottomScrollRef}
        onScroll={onBottomHorizontalScroll}
        ariaLabel={t("admin_biz_ops_table_horizontal_scroll")}
        insetForAdminSidebar={sidebarExpanded}
      />
    </div>
  );
}
