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
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminStoreListBulkBar } from "@/components/admin/stores/AdminStoreListBulkBar";
import { AdminSampleStoreDeleteDrawer } from "@/components/admin/stores/AdminSampleStoreDeleteDrawer";
import { adminStoreActionSuccessMessage } from "@/components/admin/stores/AdminStoreReviewPanel";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStoreVisibilityLockConfirmCopy } from "@/lib/admin-business/admin-store-visibility-lock-copy";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  EMPTY_ADMIN_STORE_SELECTION,
  isPageFullySelected,
  onFilterChangeAdminStoreSelection,
  removeFromAdminStoreSelection,
  selectAllResultsAdminStoreSelection,
  toggleAdminStoreSelection,
  togglePageAdminStoreSelection,
  type AdminStoreSelection,
} from "@/lib/admin-business/admin-store-selection";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { normalizeAdminListPageSize, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
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
  "kind",
  "visible",
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
  /** 페이지 크기 20/50/100 — 주소 `size` (기본 20, 기본값은 주소에 쓰지 않는다). */
  const [pageSize, setPageSize] = useState<AdminListPageSize>(() =>
    normalizeAdminListPageSize(new URLSearchParams(searchParams.toString()).get("size"), 20)
  );
  const [filterOptions, setFilterOptions] = useState<{
    categories: { id: string; name: string }[];
    regions: string[];
  }>({ categories: [], regions: [] });
  const [loading, setLoading] = useState(true);
  /** 5-A AB-03 — 선택 = id 집합 (페이지를 옮겨도 유지) · 「전체 결과 선택」은 서버 확정 id */
  const [selection, setSelection] = useState<AdminStoreSelection>(EMPTY_ADMIN_STORE_SELECTION);
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);

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
    filters.kind,
    filters.visible,
  ]);

  const qs = useMemo(() => {
    const parts = new URLSearchParams();
    parts.set("page", String(page));
    parts.set("pageSize", String(pageSize));
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
    if (filters.kind) parts.set("kind", filters.kind);
    if (filters.visible) parts.set("visible", filters.visible);
    return `?${parts.toString()}`;
  }, [filters, debouncedQ, page, pageSize]);

  /** 필터 키 (페이지 제외) — 바뀌면 「전체 결과 선택」 표시만 해제, 선택 id 는 유지 */
  const filterKey = useMemo(
    () => [debouncedQ, ...URL_FILTER_KEYS.filter((k) => k !== "q").map((k) => filters[k])].join("|"),
    [debouncedQ, filters]
  );
  useEffect(() => {
    setSelection((prev) => onFilterChangeAdminStoreSelection(prev, filterKey));
  }, [filterKey]);

  /** DEF-53 — 현재 필터를 URL 에 반영 (뒤로가기·공유·상세에서 복귀 시 유지). */
  const listUrl = useMemo(() => {
    const sp = new URLSearchParams();
    for (const key of URL_FILTER_KEYS) {
      const v = key === "q" ? debouncedQ : filters[key];
      if (!v || v === DEFAULT_OPS_FILTERS[key]) continue;
      sp.set(key, v);
    }
    if (pageSize !== 20) sp.set("size", String(pageSize));
    if (page > 1) sp.set("page", String(page));
    const q = sp.toString();
    return `${pathname || "/admin/business"}${q ? `?${q}` : ""}`;
  }, [filters, debouncedQ, page, pageSize, pathname]);

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
        setFilterOptions(j.filterOptions ?? { categories: [], regions: [] });
      } else {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadError({
          code: j.error ?? (res.status === 403 ? "forbidden" : "load_failed"),
          status: res.status,
        });
      }
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const rowsById = useMemo(
    () => new Map(rows.map((r) => [r.id, { id: r.id, store_name: r.storeName || null }])),
    [rows]
  );

  /** 5-A AB-03 — 서버가 같은 조건으로 전체 결과 id 확정 (페이지 무관, 상한 있음) */
  const selectAllResults = async () => {
    if (selectAllBusy) return;
    setSelectAllBusy(true);
    try {
      const res = await fetch(`/api/admin/business/ops-list${qs}&select_all=1`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        ids?: string[];
        total?: number;
        truncated?: boolean;
        max?: number;
      } | null;
      if (!json?.ok || !Array.isArray(json.ids)) {
        setActionResult({ ok: false, code: json?.error ?? "load_failed" });
        return;
      }
      setSelection(
        selectAllResultsAdminStoreSelection({
          ids: json.ids,
          total: Number(json.total) || json.ids.length,
          filterKey,
        })
      );
      if (json.truncated) {
        setActionResult({
          ok: true,
          message: ko
            ? `결과가 ${formatAdminNumber(json.total)}곳이라 앞의 ${formatAdminNumber(json.max)}곳만 선택했습니다.`
            : `Only the first ${json.max} of ${json.total} were selected.`,
        });
      }
    } catch {
      setActionResult({ ok: false, code: "network_error" });
    } finally {
      setSelectAllBusy(false);
    }
  };

  /** 행별 숨김/노출 — 기존 관리자 매장 PATCH(set_store_visible) 재사용 */
  const toggleVisibility = async (r: AdminBusinessListOpsRow) => {
    const enable = !r.isVisible;
    const cta = enable ? adminCta("exposeStart", ko) : adminCta("exposeStop", ko);
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(enable ? "exposeStart" : "exposeStop"),
      ko,
      title: `${r.storeName.trim() || "—"} · ${cta}`,
      // v4 UI-04 — 관리자 숨김 = 오너 재노출 잠금 (O-04)
      description: adminStoreVisibilityLockConfirmCopy(enable, ko),
      confirmLabel: cta,
    });
    if (!confirmed.ok) return;
    setBusyId(r.id);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_store_visible",
          enabled: enable,
          ...(confirmed.reason ? { reason: confirmed.reason } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) {
        setActionResult({ ok: false, code: json?.error ?? (res.status === 403 ? "forbidden" : "action_failed") });
        return;
      }
      setActionResult({ ok: true, message: adminStoreActionSuccessMessage("set_store_visible", ko, enable) });
      await load();
    } catch {
      setActionResult({ ok: false, code: "network_error" });
    } finally {
      setBusyId(null);
    }
  };

  const selectionScopeLabel =
    selection.scope === "all_results"
      ? ko
        ? `전체 결과 선택 (조건 일치 ${formatAdminNumber(selection.allResultsTotal)}곳)`
        : `All results (${selection.allResultsTotal})`
      : ko
        ? "직접 선택 · 페이지를 옮겨도 유지"
        : "Manual selection · kept across pages";

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
      <AdminResultBanner ko={ko} result={actionResult} onClose={() => setActionResult(null)} />
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface" data-admin-biz-bulk-host="1">
        <AdminStoreListBulkBar
          ko={ko}
          selectedIds={selection.ids}
          scopeLabel={selectionScopeLabel}
          rowsById={rowsById}
          onClear={() => setSelection(EMPTY_ADMIN_STORE_SELECTION)}
          onCompleted={() => {
            void load();
          }}
          onOpenDelete={() => setDeleteIds([...selection.ids])}
        />
        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2" data-admin-biz-select-controls="1">
            <label className="inline-flex items-center gap-2 text-[13px] text-sam-fg">
              <input
                type="checkbox"
                checked={isPageFullySelected(selection, pageIds)}
                onChange={() => setSelection((prev) => togglePageAdminStoreSelection(prev, pageIds))}
                data-admin-biz-select-page="1"
              />
              {ko ? `현재 페이지 선택 (${formatAdminNumber(pageIds.length)}곳)` : `Select this page (${pageIds.length})`}
            </label>
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={selectAllBusy || loading}
              onClick={() => void selectAllResults()}
              data-admin-biz-select-all-results="1"
            >
              {ko ? `전체 결과 선택 (${formatAdminNumber(total)}곳)` : `Select all results (${total})`}
            </AdminActionButton>
            {selection.ids.length > 0 ? (
              <span className="text-[12px] text-sam-muted">
                {ko
                  ? `선택 ${formatAdminNumber(selection.ids.length)}곳 · ${selectionScopeLabel}`
                  : `${selection.ids.length} selected · ${selectionScopeLabel}`}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {loadError ? (
        <AdminErrorState
          ko={ko}
          code={loadError.code}
          httpStatus={loadError.status}
          onRetry={() => void load()}
        />
      ) : null}
      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : <AdminEmptyState
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
            selection={{
              selectedIds: selection.ids,
              pageFullySelected: isPageFullySelected(selection, pageIds),
              onToggleRow: (id) => setSelection((prev) => toggleAdminStoreSelection(prev, id)),
              onTogglePage: () => setSelection((prev) => togglePageAdminStoreSelection(prev, pageIds)),
              onToggleVisibility: (row) => void toggleVisibility(row),
              onDeleteSample: (row) => setDeleteIds([row.id]),
              busyId,
            }}
          />
          <AdminPagination
            ko={ko}
            page={page}
            size={pageSize}
            total={total}
            onPageChange={setPage}
            onSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
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
      <AdminSampleStoreDeleteDrawer
        open={deleteIds != null}
        storeIds={deleteIds ?? []}
        ko={ko}
        onClose={() => setDeleteIds(null)}
        onDone={(removedIds) => {
          setSelection((prev) => removeFromAdminStoreSelection(prev, removedIds));
          void load();
        }}
      />
    </div>
  );
}
