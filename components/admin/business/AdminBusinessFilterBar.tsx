"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_STORE_STATUS_FILTER } from "@/components/admin/stores/admin-store-review-model";
import type { AdminBusinessListOpsKpi } from "@/lib/admin-business/load-admin-business-list";

export type AdminBusinessOpsFilters = {
  q: string;
  approval: string;
  open: string;
  orderable: string;
  delivery: string;
  settlement: string;
  report: string;
  restriction: string;
  category_id: string;
  region: string;
  sort: string;
};

export const DEFAULT_OPS_FILTERS: AdminBusinessOpsFilters = {
  q: "",
  approval: "all",
  open: "",
  orderable: "",
  delivery: "",
  settlement: "",
  report: "",
  restriction: "",
  category_id: "",
  region: "",
  sort: "last_order",
};

type FilterOptions = {
  categories: { id: string; name: string }[];
  regions: string[];
};

type KpiKey =
  | "total"
  | "open"
  | "closed"
  | "pending"
  | "restricted"
  | "in_progress"
  | "settlement"
  | "reports";

const KPI_DEFS: {
  key: KpiKey;
  labelKey: MessageKey;
  apply: Partial<AdminBusinessOpsFilters>;
  value: (k: AdminBusinessListOpsKpi) => number;
  pctOfTotal?: boolean;
  warn?: boolean;
}[] = [
  {
    key: "total",
    labelKey: "admin_biz_ops_kpi_total",
    apply: { ...DEFAULT_OPS_FILTERS, q: "", sort: "last_order" },
    value: (k) => k.totalStores,
  },
  {
    key: "open",
    labelKey: "admin_biz_ops_kpi_open",
    apply: { open: "open" },
    value: (k) => k.openNow,
    pctOfTotal: true,
  },
  {
    key: "closed",
    labelKey: "admin_biz_ops_kpi_closed",
    apply: { open: "closed" },
    value: (k) => k.closedNow,
    pctOfTotal: true,
  },
  {
    key: "pending",
    labelKey: "admin_biz_ops_kpi_pending",
    apply: { approval: "pending_family" },
    value: (k) => k.pendingApproval,
    pctOfTotal: true,
  },
  {
    key: "restricted",
    labelKey: "admin_biz_ops_kpi_restricted",
    apply: { restriction: "yes" },
    value: (k) => k.restricted,
    pctOfTotal: true,
  },
  {
    key: "in_progress",
    labelKey: "admin_biz_ops_kpi_in_progress",
    apply: {},
    value: (k) => k.inProgressOrders,
  },
  {
    key: "settlement",
    labelKey: "admin_biz_ops_kpi_settlement",
    apply: { settlement: "attention" },
    value: (k) => k.settlementNeedsCheck,
    warn: true,
  },
  {
    key: "reports",
    labelKey: "admin_biz_ops_kpi_reports",
    apply: { report: "open" },
    value: (k) => k.openReports,
    warn: true,
  },
];

const selectClass =
  "h-9 rounded-ui-rect border border-sam-border bg-white px-2.5 sam-text-helper text-sam-fg shadow-sm";

export function AdminBusinessOpsFilterBar({
  filters,
  onChange,
  kpi,
  filterOptions,
  resultCount,
  loading,
  viewMode,
  onViewModeChange,
}: {
  filters: AdminBusinessOpsFilters;
  onChange: (f: AdminBusinessOpsFilters) => void;
  kpi: AdminBusinessListOpsKpi | null;
  filterOptions: FilterOptions;
  resultCount?: number;
  loading?: boolean;
  viewMode: "list" | "grid";
  onViewModeChange: (m: "list" | "grid") => void;
}) {
  const { t } = useI18n();

  const activeKpi = (def: (typeof KPI_DEFS)[number]): boolean => {
    if (def.key === "total") {
      return (
        !filters.open &&
        !filters.orderable &&
        !filters.delivery &&
        !filters.settlement &&
        !filters.report &&
        !filters.restriction &&
        (filters.approval === "all" || !filters.approval) &&
        !filters.category_id &&
        !filters.region
      );
    }
    return Object.entries(def.apply).every(
      ([k, v]) => (filters as Record<string, string>)[k] === v
    );
  };

  return (
    <div className="space-y-4">
      {kpi ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {KPI_DEFS.map((def) => {
            const active = activeKpi(def);
            const n = def.value(kpi);
            const pct =
              def.pctOfTotal && kpi.totalStores > 0
                ? ((n / kpi.totalStores) * 100).toFixed(1)
                : null;
            return (
              <button
                key={def.key}
                type="button"
                onClick={() =>
                  onChange({
                    ...DEFAULT_OPS_FILTERS,
                    q: filters.q,
                    sort: filters.sort,
                    ...def.apply,
                  })
                }
                className={`rounded-ui-rect border px-3 py-3 text-left shadow-sm transition ${
                  active
                    ? "border-signature bg-signature/10 ring-1 ring-signature/30"
                    : def.warn && n > 0
                      ? "border-amber-200 bg-amber-50/80 hover:bg-amber-50"
                      : "border-sam-border bg-white hover:bg-sam-app"
                }`}
              >
                <div className="sam-text-helper text-sam-muted leading-tight">
                  {t(def.labelKey)}
                </div>
                <div
                  className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${
                    def.warn && n > 0 ? "text-amber-900" : "text-sam-fg"
                  }`}
                >
                  {n.toLocaleString()}
                </div>
                {pct != null ? (
                  <div className="mt-0.5 text-[11px] tabular-nums text-sam-muted">{pct}%</div>
                ) : (
                  <div className="mt-0.5 h-[14px]" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            placeholder={t("admin_biz_ops_search_ph")}
            className="h-10 w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-app px-3 sam-text-body text-sam-fg outline-none focus:border-signature"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={filters.sort}
              onChange={(e) => onChange({ ...filters, sort: e.target.value })}
              aria-label={t("admin_biz_ops_sort")}
            >
              <option value="last_order">{t("admin_biz_ops_sort_last_order")}</option>
              <option value="created">{t("admin_biz_ops_sort_created")}</option>
              <option value="reports">{t("admin_biz_ops_sort_reports")}</option>
              <option value="name">{t("admin_biz_ops_sort_name")}</option>
            </select>
            <div className="inline-flex overflow-hidden rounded-ui-rect border border-sam-border">
              <button
                type="button"
                className={`px-2.5 py-1.5 sam-text-helper ${
                  viewMode === "list" ? "bg-signature text-white" : "bg-white text-sam-fg"
                }`}
                onClick={() => onViewModeChange("list")}
              >
                {t("admin_biz_ops_view_list")}
              </button>
              <button
                type="button"
                className={`px-2.5 py-1.5 sam-text-helper ${
                  viewMode === "grid" ? "bg-signature text-white" : "bg-white text-sam-fg"
                }`}
                onClick={() => onViewModeChange("grid")}
              >
                {t("admin_biz_ops_view_grid")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className={selectClass}
            value={filters.category_id}
            onChange={(e) => onChange({ ...filters, category_id: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_category")}: {t("admin_biz_ops_filter_all")}
            </option>
            {filterOptions.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filters.region}
            onChange={(e) => onChange({ ...filters, region: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_region")}: {t("admin_biz_ops_filter_all")}
            </option>
            {filterOptions.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filters.approval}
            onChange={(e) => onChange({ ...filters, approval: e.target.value })}
          >
            {ADMIN_STORE_STATUS_FILTER.map((f) => (
              <option key={f.value} value={f.value}>
                {t(f.labelKey)}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filters.open}
            onChange={(e) => onChange({ ...filters, open: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_open")}: {t("admin_biz_ops_filter_all")}
            </option>
            <option value="open">{t("admin_biz_ops_open_open")}</option>
            <option value="closed">{t("admin_biz_ops_open_closed")}</option>
            <option value="break">{t("admin_biz_ops_open_break")}</option>
            <option value="temp_closed">{t("admin_biz_ops_open_temp_closed")}</option>
          </select>
          <select
            className={selectClass}
            value={filters.settlement}
            onChange={(e) => onChange({ ...filters, settlement: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_settlement")}: {t("admin_biz_ops_filter_all")}
            </option>
            <option value="ok">{t("admin_biz_ops_settle_ok")}</option>
            <option value="needs_check">{t("admin_biz_ops_settle_needs_check")}</option>
            <option value="held">{t("admin_biz_ops_settle_held")}</option>
          </select>
          <select
            className={selectClass}
            value={filters.report}
            onChange={(e) => onChange({ ...filters, report: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_report")}: {t("admin_biz_ops_filter_all")}
            </option>
            <option value="open">{t("admin_biz_ops_filter_report_open")}</option>
            <option value="none">{t("admin_biz_ops_filter_report_none")}</option>
          </select>
          <select
            className={selectClass}
            value={filters.restriction}
            onChange={(e) => onChange({ ...filters, restriction: e.target.value })}
          >
            <option value="">
              {t("admin_biz_ops_filter_restriction")}: {t("admin_biz_ops_filter_all")}
            </option>
            <option value="yes">{t("admin_biz_ops_filter_yes")}</option>
            <option value="no">{t("admin_biz_ops_filter_no")}</option>
          </select>
          <button
            type="button"
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-app px-3 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted"
            onClick={() => onChange({ ...DEFAULT_OPS_FILTERS })}
          >
            {t("admin_biz_ops_filter_reset")}
          </button>
        </div>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {loading
            ? t("common_loading")
            : typeof resultCount === "number"
              ? t("admin_biz_result_count", { count: resultCount })
              : null}
        </p>
      </div>
    </div>
  );
}
