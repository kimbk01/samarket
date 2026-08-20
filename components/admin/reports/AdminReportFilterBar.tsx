"use client";

import type { ReportStatus, ReportTargetType } from "@/lib/types/report";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
}

export function AdminReportFilterBar({ filters, onChange }: AdminReportFilterBarProps) {
  const { t, safeT } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.reportSource}
        onChange={(e) =>
          onChange({
            ...filters,
            reportSource: e.target.value as AdminReportDomainFilter,
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        data-testid="admin-report-domain-filter"
        aria-label={safeT("admin_report_filter_domain_aria", {
          fallbackKo: "신고 도메인",
          fallbackEn: "Report domain",
        })}
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
      <select
        value={filters.targetType}
        onChange={(e) =>
          onChange({ ...filters, targetType: e.target.value as ReportTargetType | "" })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {TARGET_TYPE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({ ...filters, status: e.target.value as ReportStatus | "" })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {REPORT_STATUS_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={filters.reasonCode}
        onChange={(e) => onChange({ ...filters, reasonCode: e.target.value })}
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {REASON_CODE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
