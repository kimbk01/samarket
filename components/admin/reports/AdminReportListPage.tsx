"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
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
      <AdminPageHeader
        title="통합 신고 목록"
        description="기존 reports와 커뮤니티 피드 신고(community_reports)를 한 표에 시간순으로 모읍니다. 상세보기에서 유형에 맞게 처리합니다."
      />
      <AdminReportFilterBar filters={filters} onChange={setFilters} />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          조건에 맞는 신고가 없습니다.
        </div>
      ) : (
        <AdminReportTable reports={filtered} />
      )}
    </div>
  );
}
