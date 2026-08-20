"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReportsForAdminFromDb } from "@/lib/admin-reports/getReportsFromDb";
import type { Report } from "@/lib/types/report";
import {
  filterReports,
  resolveAdminReportDomainFromQuery,
} from "@/lib/admin-reports/report-admin-utils";
import type { AdminReportFilters } from "./AdminReportFilterBar";
import { AdminReportFilterBar } from "./AdminReportFilterBar";
import { AdminReportTable } from "./AdminReportTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

function buildDefaultFilters(reportSource: AdminReportFilters["reportSource"]): AdminReportFilters {
  return {
    reportSource,
    targetType: "",
    status: "",
    reasonCode: "",
  };
}

export function AdminReportListPage() {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const targetFromQuery = (searchParams.get("target") ?? "").trim();
  const domainFromQuery = resolveAdminReportDomainFromQuery({
    domain: searchParams.get("domain"),
    from: searchParams.get("from"),
  });

  const [filters, setFilters] = useState<AdminReportFilters>(() =>
    buildDefaultFilters(domainFromQuery)
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFilters((prev) =>
      prev.reportSource === domainFromQuery ? prev : { ...prev, reportSource: domainFromQuery }
    );
  }, [domainFromQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, feedRes] = await Promise.all([
      getReportsForAdminFromDb(),
      fetch("/api/admin/community-reports", { credentials: "include", cache: "no-store" }).then((r) =>
        r.json()
      ),
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
    () =>
      filterReports(reports, {
        ...filters,
        targetId: targetFromQuery || undefined,
      }),
    [reports, filters, targetFromQuery]
  );

  const showingBothDomains = filters.reportSource === "";

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_report_list_title" descriptionKey="admin_report_list_description" />
      <div
        className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
        data-testid="admin-report-domain-ssot-banner"
      >
        {safeT("admin_report_domain_ssot_banner", {
          fallbackKo:
            "표시 큐만 합칩니다. 원장 테이블은 분리됩니다 — Trade=reports · Community=community_reports. 조치는 해당 도메인 상세 writer만 사용하세요. 계정 제재는 MCC/제재 원장과 별개입니다.",
          fallbackEn:
            "Display queue only. Tables stay separate — Trade=reports · Community=community_reports. Act only via that domain’s detail writer. Account sanctions are separate (MCC / sanction ledger).",
        })}
      </div>
      {showingBothDomains ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
          {safeT("admin_report_domain_all_hint", {
            fallbackKo: "현재 도메인 필터가 전체입니다. 운영 전 Trade 또는 Community로 좁히세요.",
            fallbackEn: "Domain filter is All. Narrow to Trade or Community before acting.",
          })}
        </div>
      ) : null}
      {targetFromQuery ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">
            {safeT("admin_report_filter_target_chip", {
              fallbackKo: "대상",
              fallbackEn: "Target",
            })}
            :
          </span>
          <Link
            href={
              filters.reportSource === "community_feed"
                ? `/admin/community/posts/${encodeURIComponent(targetFromQuery)}`
                : `/admin/products/${encodeURIComponent(targetFromQuery)}`
            }
            className="font-mono text-signature hover:underline"
            prefetch={false}
          >
            {targetFromQuery}
          </Link>
          <Link
            href={
              filters.reportSource === "community_feed"
                ? "/admin/reports?domain=community"
                : filters.reportSource === "reports"
                  ? "/admin/reports?domain=trade"
                  : "/admin/reports"
            }
            className="sam-text-xxs text-sam-muted hover:underline"
            prefetch={false}
          >
            {safeT("admin_report_clear_target_filter", {
              fallbackKo: "필터 해제",
              fallbackEn: "Clear filter",
            })}
          </Link>
        </div>
      ) : null}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper"
        data-testid="admin-report-domain-authority-links"
      >
        <span className="text-sam-muted">
          {safeT("admin_report_domain_entries_label", {
            fallbackKo: "도메인 진입",
            fallbackEn: "Domain entry",
          })}
          :
        </span>
        <Link href="/admin/reports?domain=trade" className="text-signature underline" prefetch={false}>
          Trade
        </Link>
        <Link href="/admin/community/reports" className="text-signature underline" prefetch={false}>
          Community
        </Link>
        <Link href="/admin/store-reports" className="text-signature underline" prefetch={false}>
          Delivery
        </Link>
        <Link href="/admin/chats/reported" className="text-signature underline" prefetch={false}>
          Messenger
        </Link>
        <Link href="/admin/reports/log" className="text-sam-muted underline" prefetch={false}>
          {safeT("admin_report_audit_ledger_link", {
            fallbackKo: "제재 원장",
            fallbackEn: "Sanction ledger",
          })}
        </Link>
      </div>
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
