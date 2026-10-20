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
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import Link from "next/link";

function buildDefaultFilters(
  reportSource: AdminReportFilters["reportSource"],
  targetType: AdminReportFilters["targetType"] = ""
): AdminReportFilters {
  return {
    reportSource,
    targetType,
    status: "",
    reasonCode: "",
  };
}

function resolveTargetTypeFromQuery(raw: string | null): AdminReportFilters["targetType"] {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "product" || v === "community" || v === "chat" || v === "user") {
    return v;
  }
  return "";
}

export function AdminReportListPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const targetFromQuery = (searchParams.get("target") ?? "").trim();
  const domainFromQuery = resolveAdminReportDomainFromQuery({
    domain: searchParams.get("domain"),
    from: searchParams.get("from"),
  });
  const targetTypeFromQuery = resolveTargetTypeFromQuery(
    searchParams.get("target_type") ?? searchParams.get("targetType")
  );

  const [filters, setFilters] = useState<AdminReportFilters>(() =>
    buildDefaultFilters(domainFromQuery, targetTypeFromQuery)
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  /** A source failed to load — the list is partial and must not read as "nothing pending". */
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setFilters((prev) => {
      const nextSource = prev.reportSource === domainFromQuery ? prev.reportSource : domainFromQuery;
      const nextType = prev.targetType === targetTypeFromQuery ? prev.targetType : targetTypeFromQuery;
      if (nextSource === prev.reportSource && nextType === prev.targetType) return prev;
      return { ...prev, reportSource: nextSource, targetType: nextType };
    });
  }, [domainFromQuery, targetTypeFromQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    const [tradeRes, feedRes] = await Promise.all([
      getReportsForAdminFromDb().then(
        (list) => ({ ok: true as const, list }),
        () => ({ ok: false as const, list: [] as Report[] })
      ),
      fetch("/api/admin/community-reports", { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const feedOk = Boolean(feedRes?.ok && Array.isArray(feedRes.reports));
    const feedList: Report[] = feedOk ? (feedRes.reports as Report[]) : [];
    const merged = [...tradeRes.list, ...feedList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setReports(merged);
    setLoadFailed(!tradeRes.ok || !feedOk);
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
      <AdminPageHeader titleKey="admin_menu_reports_observation" descriptionKey="admin_report_list_description" />
      <div
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg"
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
      {loadFailed ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-fg"
          role="alert"
          data-testid="admin-report-load-failed"
        >
          <span>
            {safeT("admin_report_list_load_failed", {
              fallbackKo: "일부 신고 목록을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.",
              fallbackEn: "Some reports could not be loaded. Refresh and check again.",
            })}
          </span>
          <AdminActionButton variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
            {adminCta("refresh", ko)}
          </AdminActionButton>
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
        <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={t("admin_report_list_empty_filtered")}
          onReset={
            filters.status ||
            filters.reasonCode ||
            filters.targetType !== targetTypeFromQuery ||
            filters.reportSource !== domainFromQuery
              ? () => setFilters(buildDefaultFilters(domainFromQuery, targetTypeFromQuery))
              : undefined
          }
        />
      ) : (
        <AdminReportTable reports={filtered} />
      )}
    </div>
  );
}
