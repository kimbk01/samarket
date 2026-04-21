"use client";

import type { ReportStatus, ReportTargetType } from "@/lib/types/report";
import {
  TARGET_TYPE_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REASON_CODE_OPTIONS,
} from "@/lib/admin-reports/report-admin-utils";

export interface AdminReportFilters {
  targetType: ReportTargetType | "";
  status: ReportStatus | "";
  reasonCode: string;
}

interface AdminReportFilterBarProps {
  filters: AdminReportFilters;
  onChange: (f: AdminReportFilters) => void;
}

export function AdminReportFilterBar({ filters, onChange }: AdminReportFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.targetType}
        onChange={(e) =>
          onChange({ ...filters, targetType: e.target.value as ReportTargetType | "" })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {TARGET_TYPE_OPTIONS.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
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
            {o.label}
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
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
