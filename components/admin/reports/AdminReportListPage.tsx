"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import type { AdminListQueryPatch } from "@/lib/admin/list-query/admin-list-query";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReportsForAdminFromDb } from "@/lib/admin-reports/getReportsFromDb";
import type { Report } from "@/lib/types/report";
import {
  filterReports,
  REPORT_STATUS_OPTIONS,
  resolveAdminReportDomainFromQuery,
  type AdminReportDomainFilter,
} from "@/lib/admin-reports/report-admin-utils";
import type { ReportStatus } from "@/lib/types/report";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import type { AdminReportFilters } from "./AdminReportFilterBar";
import { AdminReportFilterBar } from "./AdminReportFilterBar";
import { AdminReportTable } from "./AdminReportTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import Link from "next/link";

function resolveTargetTypeFromQuery(raw: string | null): AdminReportFilters["targetType"] {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "product" || v === "community" || v === "chat" || v === "user") {
    return v;
  }
  return "";
}

const REPORT_STATUS_VALUES = REPORT_STATUS_OPTIONS.map((o) => o.value).filter(Boolean) as ReportStatus[];
/** 주소 키 — `domain`(예전 딥링크 `?domain=community`·`?from=community` 호환) · `target_type` · `reason`. */
const REPORT_LIST_EXTRAS = ["domain", "target_type", "reason"] as const;

/** 화면 도메인 → 주소 값. Trade 는 `trade` 가 아닌 `reports` (page.tsx 가 `?domain=trade` 를 거래 신고 화면으로 보낸다). */
function domainParamOf(source: AdminReportDomainFilter): string {
  if (source === "community_feed") return "community";
  if (source === "reports") return "reports";
  return "";
}

export function AdminReportListPage() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const targetFromQuery = (searchParams.get("target") ?? "").trim();
  /** R7 — 조건(도메인·상태·대상 유형·사유)은 주소에 남는다 (새로고침·링크 공유·상세 복귀 유지). */
  const lq = useAdminListQuery<(typeof REPORT_LIST_EXTRAS)[number]>({
    statuses: REPORT_STATUS_VALUES,
    extras: REPORT_LIST_EXTRAS,
  });
  const legacyFrom = searchParams.get("from");
  const legacyTargetType = searchParams.get("targetType");
  const filters = useMemo<AdminReportFilters>(
    () => ({
      reportSource: resolveAdminReportDomainFromQuery({ domain: lq.query.extras.domain, from: legacyFrom }),
      targetType: resolveTargetTypeFromQuery(lq.query.extras.target_type || legacyTargetType),
      status: lq.query.status as ReportStatus | "",
      reasonCode: lq.query.extras.reason,
    }),
    [lq.query.extras.domain, lq.query.extras.target_type, lq.query.extras.reason, lq.query.status, legacyFrom, legacyTargetType]
  );
  /** 예전 `?from=community`·`?targetType=` 링크도 첫 변경 때 표준 키로 옮겨 적는다 (`from` 은 공통 기간 키라 지워진다). */
  const setFilters = (next: AdminReportFilters) => {
    const patch: AdminListQueryPatch<(typeof REPORT_LIST_EXTRAS)[number]> = {
      status: next.status,
      extras: {
        domain: domainParamOf(next.reportSource),
        target_type: next.targetType,
        reason: next.reasonCode,
      },
    };
    lq.patch(patch);
  };
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  /** A source failed to load — the list is partial and must not read as "nothing pending". */
  const [loadFailure, setLoadFailure] = useState<{ code: string; httpStatus?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tradeRes, feedRes] = await Promise.all([
      getReportsForAdminFromDb().then(
        (list) => ({ ok: true as const, list }),
        () => ({ ok: false as const, list: [] as Report[] })
      ),
      fetch("/api/admin/community-reports", { credentials: "include", cache: "no-store" })
        .then(async (r) => ({ status: r.status, json: (await r.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          reports?: Report[];
        } | null }))
        .catch(() => ({ status: 0, json: null })),
    ]);
    const feedOk = Boolean(feedRes.json?.ok && Array.isArray(feedRes.json.reports));
    if (!tradeRes.ok && !feedOk) {
      // 두 출처 모두 실패 — 직전 정상 목록은 지우지 않는다 (§8-5).
      setLoadFailure({
        code: feedRes.json?.error || (feedRes.status ? "load_failed" : "network_error"),
        httpStatus: feedRes.status || undefined,
      });
      setLoading(false);
      return;
    }
    const feedList: Report[] = feedOk ? (feedRes.json!.reports as Report[]) : [];
    const merged = [...tradeRes.list, ...feedList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setReports(merged);
    setLoaded(true);
    setLoadFailure(
      feedOk
        ? tradeRes.ok
          ? null
          : { code: "load_failed" }
        : { code: feedRes.json?.error || (feedRes.status ? "load_failed" : "network_error"), httpStatus: feedRes.status || undefined }
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, lq.refreshKey]);

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
      {loadFailure ? (
        <div data-testid="admin-report-load-failed">
          {loaded && !(loadFailure.httpStatus === 403) ? (
            <p className="mb-2 sam-text-helper text-sam-muted">
              {safeT("admin_report_list_load_failed", {
                fallbackKo: "일부 신고 목록을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.",
                fallbackEn: "Some reports could not be loaded. Refresh and check again.",
              })}
            </p>
          ) : null}
          <AdminErrorState
            ko={ko}
            code={loadFailure.code}
            httpStatus={loadFailure.httpStatus}
            onRetry={() => void load()}
          />
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
      <AdminReportFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={lq.reset}
        onSubmit={lq.refresh}
        pending={loading}
      />
      {!loaded ? (
        loadFailure ? null : <AdminLoadingState ko={ko} label={t("admin_dashboard_loading")} />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={t("admin_report_list_empty_filtered")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminReportTable reports={filtered} />
      )}
    </div>
  );
}
