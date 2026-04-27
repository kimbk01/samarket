"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReportsForAdminFromDb } from "@/lib/admin-reports/getReportsFromDb";
import type { Report } from "@/lib/types/report";
import { filterReports } from "@/lib/admin-reports/report-admin-utils";
import type { AdminReportFilters } from "./AdminReportFilterBar";
import { AdminReportFilterBar } from "./AdminReportFilterBar";
import { AdminReportTable } from "./AdminReportTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const DEFAULT_FILTERS: AdminReportFilters = {
  targetType: "",
  status: "",
  reasonCode: "",
};

export function AdminReportListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminReportFilters>(DEFAULT_FILTERS);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, feedRes] = await Promise.all([
      getReportsForAdminFromDb(),
      fetch("/api/admin/community-reports", { credentials: "include", cache: "no-store" }).then((r) => r.json()),
    ]);
    const feedList: Report[] =
      feedRes?.ok && Array.isArray(feedRes.reports) ? (feedRes.reports as Report[]) : [];
    const merged = [...list, ...feedList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setReports(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterReports(reports, filters),
    [reports, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_report_list_title" descriptionKey="admin_report_list_description" />
      <AdminReportFilterBar filters={filters} onChange={setFilters} />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_dashboard_loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_report_list_empty_filtered")}
        </div>
      ) : (
        <AdminReportTable reports={filtered} />
      )}
    </div>
  );
}
