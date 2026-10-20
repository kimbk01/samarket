"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
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

/** URL ↔ 필터 키 (배달 대시보드 링크 `?approval=` `?report=` `?open=` `?restriction=` 포함). */
const URL_FILTER_KEYS = [
  "q",
  "approval",
  "open",
  "orderable",
  "delivery",
  "settlement",
  "report",
  "restriction",
  "category_id",
  "region",
  "sort",
] as const satisfies readonly (keyof AdminBusinessOpsFilters)[];

function filtersFromSearch(sp: URLSearchParams): AdminBusinessOpsFilters {
  const next: AdminBusinessOpsFilters = { ...DEFAULT_OPS_FILTERS };
  for (const key of URL_FILTER_KEYS) {
    const v = sp.get(key)?.trim();
    if (v) next[key] = v;
  }
  // 대시보드 링크의 pending_family 는 승인 select 의 「처리 필요」(actionable) 와 같은 의미
  if (next.approval === "pending_family") next.approval = "actionable";
  return next;
}

function pageFromSearch(sp: URLSearchParams): number {
  const n = Number(sp.get("page"));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function AdminBusinessListPage() {
  return (
    <Suspense fallback={null}>
      <AdminBusinessListPageInner />
    </Suspense>
  );
}

function AdminBusinessListPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<AdminBusinessOpsFilters>(() =>
    filtersFromSearch(new URLSearchParams(searchParams.toString()))
  );
  const [debouncedQ, setDebouncedQ] = useState(() => filters.q.trim());
  const [page, setPage] = useState(() => pageFromSearch(new URLSearchParams(searchParams.toString())));
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const skipPageResetRef = useRef(true);
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
    // 첫 렌더는 URL 의 page 를 유지한다.
    if (skipPageResetRef.current) {
      skipPageResetRef.current = false;
      return;
    }
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

  /** DEF-53 — 현재 필터를 URL 에 반영 (뒤로가기·공유·상세에서 복귀 시 유지). */
  const listUrl = useMemo(() => {
    const sp = new URLSearchParams();
    for (const key of URL_FILTER_KEYS) {
      const v = key === "q" ? debouncedQ : filters[key];
      if (!v || v === DEFAULT_OPS_FILTERS[key]) continue;
      sp.set(key, v);
    }
    if (page > 1) sp.set("page", String(page));
    const q = sp.toString();
    return `${pathname || "/admin/business"}${q ? `?${q}` : ""}`;
  }, [filters, debouncedQ, page, pathname]);

  useEffect(() => {
    const current = `${pathname || "/admin/business"}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (current === listUrl) return;
    router.replace(listUrl, { scroll: false });
  }, [listUrl, pathname, router, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/business/ops-list${qs}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = ((await res.json().catch(() => null)) ?? {}) as {
        ok?: boolean;
        error?: string;
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
        setLoadError({
          code: j.error ?? (res.status === 403 ? "forbidden" : "load_failed"),
          status: res.status,
        });
      }
    } catch {
      setRows([]);
      setKpi(null);
      setTotal(0);
      setLoadError({ code: "network_error" });
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
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState
          ko={ko}
          code={loadError.code}
          httpStatus={loadError.status}
          onRetry={() => void load()}
        />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={t("admin_biz_empty_list")}
          onReset={() => setFilters({ ...DEFAULT_OPS_FILTERS })}
        />
      ) : (
        <>
          <AdminBusinessTable
            ref={tableScrollRef}
            rows={rows}
            viewMode={viewMode}
            onHorizontalScroll={onTableHorizontalScroll}
            returnTo={listUrl}
          />
          <AdminPagination
            ko={ko}
            page={page}
            size={pageSize as AdminListPageSize}
            total={total}
            onPageChange={setPage}
            disabled={loading}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 shadow-sm"
          />
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
