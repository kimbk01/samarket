"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_STORE_STATUS_FILTER } from "@/components/admin/stores/admin-store-review-model";
import type { AdminBusinessListOpsKpi } from "@/lib/admin-business/load-admin-business-list";
import { useEffect, useState } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

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
  /** 5-A AB-01 — 매장 유형 (real · sample · legacy_test · 빈 값 = 전체) */
  kind: string;
  /** 5-A AB-02 — 노출 (yes · no · 빈 값 = 전체) */
  visible: string;
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
  kind: "",
  visible: "",
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
  /** 5-A AB-04 — 샘플·숨김 제외 운영 기준 수치 (전체 수치와 함께 표시) */
  operational?: (k: AdminBusinessListOpsKpi) => number;
  pctOfTotal?: boolean;
  warn?: boolean;
}[] = [
  {
    key: "total",
    labelKey: "admin_biz_ops_kpi_total",
    // 유형·노출 조건은 KPI 칩 클릭에서도 유지 (KPI 가 그 조건을 따른다)
    apply: {},
    value: (k) => k.totalStores,
    operational: (k) => k.operational.totalStores,
  },
  {
    key: "open",
    labelKey: "admin_biz_ops_kpi_open",
    apply: { open: "open" },
    value: (k) => k.openNow,
    operational: (k) => k.operational.openNow,
    pctOfTotal: true,
  },
  {
    key: "closed",
    labelKey: "admin_biz_ops_kpi_closed",
    apply: { open: "closed" },
    value: (k) => k.closedNow,
    operational: (k) => k.operational.closedNow,
    pctOfTotal: true,
  },
  {
    key: "pending",
    labelKey: "admin_biz_ops_kpi_pending",
    // DEF-14: 승인 필터 select 의 「처리 필요」(actionable) 와 같은 값 — 서버는 pending_family 와 동일 처리
    apply: { approval: "actionable" },
    value: (k) => k.pendingApproval,
    operational: (k) => k.operational.pendingApproval,
    pctOfTotal: true,
  },
  {
    key: "restricted",
    labelKey: "admin_biz_ops_kpi_restricted",
    apply: { restriction: "yes" },
    value: (k) => k.restricted,
    operational: (k) => k.operational.restricted,
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

/** Compact chip selects — never stretch to full row (tablet uses horizontal scroll). */
const selectClass =
  "!h-9 !w-auto min-w-[8.75rem] max-w-[13rem] shrink-0 rounded-ui-rect border border-sam-border bg-white px-2.5 sam-text-helper text-sam-fg shadow-sm";

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
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 검색어는 「조회」/Enter 때 적용 (필터 바 표준) — 선택 상자는 바꾸는 즉시 적용. */
  const [draftQ, setDraftQ] = useState(filters.q);
  useEffect(() => setDraftQ(filters.q), [filters.q]);

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

  const sortAndView = (
    <div className="flex shrink-0 items-center gap-2">
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
      <div className="inline-flex shrink-0 overflow-hidden rounded-ui-rect border border-sam-border">
        <AdminChipButton
          selected={viewMode === "list"}
          className="!rounded-none !border-0"
          onClick={() => onViewModeChange("list")}
        >
          {t("admin_biz_ops_view_list")}
        </AdminChipButton>
        <AdminChipButton
          selected={viewMode === "grid"}
          className="!rounded-none !border-0"
          onClick={() => onViewModeChange("grid")}
        >
          {t("admin_biz_ops_view_grid")}
        </AdminChipButton>
      </div>
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {kpi ? (
        <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {KPI_DEFS.map((def) => {
            const active = activeKpi(def);
            const n = def.value(kpi);
            const pct =
              def.pctOfTotal && kpi.totalStores > 0
                ? ((n / kpi.totalStores) * 100).toFixed(1)
                : null;
            return (
              <AdminChipButton
                key={def.key}
                selected={active}
                onClick={() =>
                  onChange({
                    ...DEFAULT_OPS_FILTERS,
                    q: filters.q,
                    sort: filters.sort,
                    kind: filters.kind,
                    visible: filters.visible,
                    ...def.apply,
                  })
                }
                className={`!h-auto !flex-col !items-start !gap-0 !whitespace-normal !rounded-ui-rect !px-3 !py-3 text-left !font-normal shadow-sm ${
                  !active && def.warn && n > 0 ? "!border-sam-warning !bg-sam-warning-soft" : ""
                }`}
              >
                <div className="sam-text-helper text-sam-muted leading-tight">
                  {t(def.labelKey)}
                </div>
                <div
                  className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${
                    def.warn && n > 0 ? "text-sam-warning" : "text-sam-fg"
                  }`}
                >
                  {formatAdminNumber(n)}
                </div>
                {pct != null ? (
                  <div className="mt-0.5 text-[12px] tabular-nums text-sam-muted">{pct}%</div>
                ) : (
                  <div className="mt-0.5 h-[14px]" />
                )}
                {def.operational && kpi.operational ? (
                  <div
                    className="mt-0.5 text-[12px] tabular-nums text-sam-muted"
                    data-admin-biz-kpi-operational={def.key}
                  >
                    {ko
                      ? `샘플·숨김 제외 ${formatAdminNumber(def.operational(kpi))}`
                      : `Excl. sample/hidden ${formatAdminNumber(def.operational(kpi))}`}
                  </div>
                ) : (
                  <div className="mt-0.5 h-[14px]" />
                )}
              </AdminChipButton>
            );
          })}
        </div>
      ) : null}

      <div className="w-full min-w-0">
        <AdminFilterBar
          ko={ko}
          draft={{ q: draftQ, from: "", to: "" }}
          onDraftChange={(p) => {
            if (p.q !== undefined) setDraftQ(p.q);
          }}
          onSubmit={() => onChange({ ...filters, q: draftQ.trim() })}
          onReset={() => {
            setDraftQ("");
            onChange({ ...DEFAULT_OPS_FILTERS });
          }}
          pending={loading}
          showPeriod={false}
          searchPlaceholder={t("admin_biz_ops_search_ph")}
        >
              <select
                className={selectClass}
                value={filters.kind}
                onChange={(e) => onChange({ ...filters, kind: e.target.value })}
                aria-label={ko ? "매장 유형" : "Store type"}
                data-admin-biz-filter-kind="1"
              >
                <option value="">{ko ? "유형: 전체" : "Type: All"}</option>
                <option value="real">{ko ? "실매장" : "Real"}</option>
                <option value="sample">{ko ? "샘플" : "Sample"}</option>
                <option value="legacy_test">{ko ? "테스트" : "Test"}</option>
              </select>
              <select
                className={selectClass}
                value={filters.visible}
                onChange={(e) => onChange({ ...filters, visible: e.target.value })}
                aria-label={ko ? "노출" : "Visibility"}
                data-admin-biz-filter-visible="1"
              >
                <option value="">{ko ? "노출: 전체" : "Visibility: All"}</option>
                <option value="yes">{ko ? "노출 중" : "Visible"}</option>
                <option value="no">{ko ? "숨김" : "Hidden"}</option>
              </select>
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
                    {f.value === "all"
                      ? `${t("admin_biz_ops_filter_approval")}: ${t("admin_biz_ops_filter_all")}`
                      : t(f.labelKey)}
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
        </AdminFilterBar>
        <div className="mt-2 flex justify-end">{sortAndView}</div>

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
