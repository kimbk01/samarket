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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminAuditFilters>(DEFAULT_FILTERS);
  const logs = useMemo(() => getAuditLogs(), []);
  const summary = useMemo(() => getAuditSummary(), []);
  const filtered = useMemo(
    () => filterAndSortLogs(logs, filters),
    [logs, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_dev_audit" />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_audit_summary_title")}</h2>
        <AdminAuditSummaryCards summary={summary} />
      </div>

      <AdminAuditFilterBar filters={filters} onFiltersChange={setFilters} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_audit_total_count", { count: filtered.length })}
        </span>
        <button
          type="button"
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
        >
          {t("admin_audit_download_placeholder")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_audit_empty_filtered")}
        </div>
      ) : (
        <AdminAuditLogTable logs={filtered} />
      )}
    </div>
  );
}
