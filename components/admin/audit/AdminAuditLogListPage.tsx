"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterAndSortLogs,
  type AdminAuditFilters,
  type AuditSortKey,
} from "@/lib/admin-audit/admin-audit-utils";
import { mapAuditLogRow } from "@/lib/admin-audit/map-audit-log-row";
import { buildAuditSummaryFromLogs } from "@/lib/admin-audit/build-audit-summary";
import type { AdminAuditLog } from "@/lib/types/admin-audit";
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
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/audit-logs?limit=300", {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; logs?: Record<string, unknown>[] };
      const rows = j.ok && Array.isArray(j.logs) ? j.logs : [];
      setLogs(rows.map((r) => mapAuditLogRow(r)));
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => buildAuditSummaryFromLogs(logs), [logs]);
  const filtered = useMemo(() => filterAndSortLogs(logs, filters), [logs, filters]);

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

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_audit_empty_filtered")}
        </div>
      ) : (
        <AdminAuditLogTable logs={filtered} />
      )}
    </div>
  );
}
