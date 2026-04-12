"use client";

import { useMemo, useState } from "react";
import { getAuditLogs } from "@/lib/admin-audit/mock-admin-audit-logs";
import { getAuditSummary } from "@/lib/admin-audit/mock-audit-summary";
import {
  filterAndSortLogs,
  type AdminAuditFilters,
  type AuditSortKey,
} from "@/lib/admin-audit/admin-audit-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminAuditSummaryCards } from "./AdminAuditSummaryCards";
import { AdminAuditFilterBar } from "./AdminAuditFilterBar";
import { AdminAuditLogTable } from "./AdminAuditLogTable";

const DEFAULT_FILTERS: AdminAuditFilters = {
  category: "",
  adminNickname: "",
  result: "",
  searchQuery: "",
  sortKey: "newest" as AuditSortKey,
};

export function AdminAuditLogListPage() {
  const [filters, setFilters] = useState<AdminAuditFilters>(DEFAULT_FILTERS);
  const logs = useMemo(() => getAuditLogs(), []);
  const summary = useMemo(() => getAuditSummary(), []);
  const filtered = useMemo(
    () => filterAndSortLogs(logs, filters),
    [logs, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="로그감사" />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-3 text-[15px] font-medium text-sam-fg">감사 요약</h2>
        <AdminAuditSummaryCards summary={summary} />
      </div>

      <AdminAuditFilterBar filters={filters} onFiltersChange={setFilters} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-sam-muted">
          총 {filtered.length}건
        </span>
        <button
          type="button"
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 text-[13px] font-medium text-sam-fg hover:bg-sam-app"
        >
          로그 다운로드 (placeholder)
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          조건에 맞는 로그가 없습니다.
        </div>
      ) : (
        <AdminAuditLogTable logs={filtered} />
      )}
    </div>
  );
}
