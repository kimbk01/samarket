"use client";

import type { ReportStatus, ReportTargetType } from "@/lib/types/report";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import {
  TARGET_TYPE_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REASON_CODE_OPTIONS,
  type AdminReportDomainFilter,
} from "@/lib/admin-reports/report-admin-utils";

export interface AdminReportFilters {
  /** Empty = both tables shown (display queue only — not one SSOT table). */
  reportSource: AdminReportDomainFilter;
  targetType: ReportTargetType | "";
  status: ReportStatus | "";
  reasonCode: string;
}

interface AdminReportFilterBarProps {
  filters: AdminReportFilters;
  onChange: (f: AdminReportFilters) => void;
  /** 「초기화」 */
  onReset: () => void;
  /** 「조회」 — 같은 조건으로 다시 불러오기 */
  onSubmit: () => void;
  pending?: boolean;
}

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

/**
 * 통합 신고 관찰 목록 필터 — 표준 `AdminFilterBar` (R7). 선택은 바꾸는 즉시 적용되고 주소에 남는다
 * (`domain`·`status`·`target_type`·`reason` — `AdminReportListPage` 의 `useAdminListQuery`).
 */
export function AdminReportFilterBar({ filters, onChange, onReset, onSubmit, pending = false }: AdminReportFilterBarProps) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  return (
    <AdminFilterBar
      ko={ko}
      draft={{ q: "", from: "", to: "" }}
      onDraftChange={() => undefined}
      onSubmit={onSubmit}
      onReset={onReset}
      pending={pending}
      showPeriod={false}
      showSearch={false}
      status={{
        value: filters.status,
        onChange: (v) => onChange({ ...filters, status: v as ReportStatus | "" }),
        options: REPORT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
      }}
    >
      <label className={LABEL}>
        {safeT("admin_report_filter_domain_aria", {
          fallbackKo: "신고 도메인",
          fallbackEn: "Report domain",
        })}
        <select
          value={filters.reportSource}
          onChange={(e) =>
            onChange({
              ...filters,
              reportSource: e.target.value as AdminReportDomainFilter,
            })
          }
          className={FIELD}
          data-testid="admin-report-domain-filter"
        >
          <option value="">
            {safeT("admin_report_filter_domain_all", {
              fallbackKo: "도메인: 전체(표시만)",
              fallbackEn: "Domain: all (display only)",
            })}
          </option>
          <option value="reports">
            {safeT("admin_report_filter_domain_trade", {
              fallbackKo: "Trade · reports 테이블",
              fallbackEn: "Trade · reports table",
            })}
          </option>
          <option value="community_feed">
            {safeT("admin_report_filter_domain_community", {
              fallbackKo: "Community · community_reports",
              fallbackEn: "Community · community_reports",
            })}
          </option>
        </select>
      </label>
      <label className={LABEL}>
        {ko ? "대상" : "Target"}
        <select
          value={filters.targetType}
          onChange={(e) => onChange({ ...filters, targetType: e.target.value as ReportTargetType | "" })}
          className={FIELD}
        >
          {TARGET_TYPE_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        {ko ? "사유" : "Reason"}
        <select
          value={filters.reasonCode}
          onChange={(e) => onChange({ ...filters, reasonCode: e.target.value })}
          className={FIELD}
        >
          {REASON_CODE_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </AdminFilterBar>
  );
}
