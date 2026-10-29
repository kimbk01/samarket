"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import type { AdminListQueryPatch } from "@/lib/admin/list-query/admin-list-query";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReportsPageForAdminFromDb, type AdminReportsPageExclusion } from "@/lib/admin-reports/getReportsFromDb";
import type { Report } from "@/lib/types/report";
import {
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
import { ADMIN_LIST_PAGE_SIZES, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import {
  ADMIN_REPORT_LEDGER_LABEL,
  adminTradeReportsHrefFromCentral,
  type AdminReportLedgerSource,
} from "@/lib/admin-reports/admin-report-ledger-sources";
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminCount } from "@/lib/admin/pagination/admin-pagination-window";

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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  /** 목록을 불러오지 못함 — 직전 정상 목록은 지우지 않는다 (§8-5) · 「신고 없음」으로 보이지 않게. */
  const [loadFailure, setLoadFailure] = useState<{ code: string; httpStatus?: number } | null>(null);
  /**
   * RS-02 커서 페이지 — 지금 쪽 커서 · 지나온 커서들(이전 쪽). 조건(`base`)이 바뀌면 처음 쪽부터
   * (다른 조건의 원장별 커서를 이어 쓰지 않는다).
   */
  const [paging, setPaging] = useState<{ base: string; cursor: string; trail: string[] }>({
    base: "",
    cursor: "",
    trail: [],
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<AdminReportsPageExclusion[]>([]);
  const [partial, setPartial] = useState(false);

  /**
   * RS-02 — 원장 6종(거래·커뮤니티 + 매장·모임·메신저·구 거래 채팅)을 서버에서 원장별로 읽어 병합한다 (커서 모드).
   * 예전처럼 출처별 고정 상한으로 읽어 브라우저에서 합치지 않는다. `?target=` 도 서버 필터.
   */
  const baseParams = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("limit", String(lq.query.size));
    const domain = domainParamOf(filters.reportSource);
    if (domain) qs.set("domain", domain);
    if (filters.status) qs.set("status", filters.status);
    if (filters.targetType) qs.set("target_type", filters.targetType);
    if (filters.reasonCode) qs.set("reason", filters.reasonCode);
    if (targetFromQuery) qs.set("target", targetFromQuery);
    return qs.toString();
  }, [lq.query.size, filters, targetFromQuery]);
  const cursor = paging.base === baseParams ? paging.cursor : "";
  const cursorTrail = paging.base === baseParams ? paging.trail : [];

  const apiParams = useMemo(() => {
    const qs = new URLSearchParams(baseParams);
    qs.set("cursor", cursor);
    return qs.toString();
  }, [baseParams, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getReportsPageForAdminFromDb(new URLSearchParams(apiParams));
      setReports(page.reports);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      setExcluded(page.excludedSources);
      setPartial(page.partial);
      setLoaded(true);
      setLoadFailure(null);
    } catch (e) {
      const httpStatus = (e as { httpStatus?: number }).httpStatus;
      const message = e instanceof Error ? e.message : "";
      setLoadFailure({
        code: !httpStatus ? "network_error" : message && !/^reports_load_failed_/.test(message) ? message : "load_failed",
        httpStatus: httpStatus || undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [apiParams]);

  useEffect(() => {
    void load();
  }, [load, lq.refreshKey]);

  const showingBothDomains = filters.reportSource === "";
  const pageIndex = cursorTrail.length;
  const firstRow = reports.length ? pageIndex * lq.query.size + 1 : 0;
  const lastRow = pageIndex * lq.query.size + reports.length;
  const goNext = () => {
    if (!nextCursor || loading) return;
    setPaging({ base: baseParams, cursor: nextCursor, trail: [...cursorTrail, cursor] });
  };
  const goPrev = () => {
    if (!cursorTrail.length || loading) return;
    setPaging({ base: baseParams, cursor: cursorTrail[cursorTrail.length - 1] ?? "", trail: cursorTrail.slice(0, -1) });
  };
  const ledgerName = (src: string) =>
    ADMIN_REPORT_LEDGER_LABEL[src as AdminReportLedgerSource]?.[ko ? "ko" : "en"] ?? src;
  const permissionExcluded = excluded.filter((e) => e.reason === "permission");
  const filterExcluded = excluded.filter((e) => e.reason === "filter");
  /** RS-03 — 거래 신고 화면으로 바로 (예전 `/admin/reports?domain=trade` 는 redirect 에서 상태·대상 조건이 빠졌다). */
  const tradeHref = (withTarget: boolean) =>
    adminTradeReportsHrefFromCentral({
      status: filters.status,
      targetType: filters.targetType,
      target: withTarget ? targetFromQuery : "",
    });

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_reports_observation" descriptionKey="admin_report_list_description" />
      <div
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg"
        data-testid="admin-report-domain-ssot-banner"
      >
        {safeT("admin_report_domain_ssot_banner", {
          fallbackKo:
            "신고 원장 6종을 한 목록으로 봅니다. 거래·커뮤니티 신고는 「상세」에서 바로 처리할 수 있습니다 (도메인 화면과 같은 서버 처리). 매장·모임·메신저·구 거래 채팅 신고는 여기서 조회만 하고, 각 행의 「처리 화면」에서 처리합니다. 계정 정지·차단은 회원 상세에서 합니다.",
          fallbackEn:
            "All six report ledgers in one list. Trade and community reports can be processed from Detail (same server action as the domain screens). Store, meeting, messenger and legacy trade-chat reports are view-only here — process them via each row’s domain screen. Account suspensions are done in member detail.",
        })}
      </div>
      {partial ? (
        <div
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg"
          data-testid="admin-report-ledger-partial"
        >
          {ko ? "일부 원장 제외됨" : "Some ledgers excluded"} —{" "}
          {ko
            ? `열람 권한이 없는 원장은 목록과 건수에서 빠졌습니다: ${permissionExcluded.map((e) => ledgerName(e.source)).join(", ")}`
            : `Ledgers you cannot view are left out of the list and count: ${permissionExcluded.map((e) => ledgerName(e.source)).join(", ")}`}
        </div>
      ) : null}
      {filterExcluded.length ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
          {ko
            ? `사유·대상 조건은 거래·커뮤니티 신고에만 적용됩니다. 제외된 원장: ${filterExcluded.map((e) => ledgerName(e.source)).join(", ")}`
            : `Reason / target filters apply to trade and community reports only. Excluded: ${filterExcluded.map((e) => ledgerName(e.source)).join(", ")}`}
        </div>
      ) : null}
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
                  ? tradeHref(false)
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
        <Link href={tradeHref(true)} className="text-signature underline" prefetch={false}>
          Trade
        </Link>
        <Link href="/admin/community/reports" className="text-signature underline" prefetch={false}>
          Community
        </Link>
        <Link href="/admin/store-reports" className="text-signature underline" prefetch={false}>
          Delivery
        </Link>
        <Link href="/admin/philife/meeting-reports" className="text-signature underline" prefetch={false}>
          Meeting
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
      ) : reports.length === 0 && total === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={t("admin_report_list_empty_filtered")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <>
          <AdminReportTable reports={reports} />
          {/* RS-02 원장별 커서 — 이전·다음 쪽 (번호 이동 없음) */}
          <nav
            className="flex flex-wrap items-center justify-end gap-2 sam-text-helper text-sam-muted"
            data-admin-report-cursor-pagination="1"
          >
            <span>
              {ko
                ? `전체 ${formatAdminCount(total)}건 중 ${firstRow}–${lastRow}`
                : `${firstRow}–${lastRow} of ${formatAdminCount(total)}`}
            </span>
            <AdminActionButton
              size="sm"
              onClick={goPrev}
              disabled={loading || cursorTrail.length === 0}
            >
              {ko ? "이전" : "Prev"}
            </AdminActionButton>
            <AdminActionButton
              size="sm"
              onClick={goNext}
              disabled={loading || !nextCursor}
            >
              {ko ? "다음" : "Next"}
            </AdminActionButton>
            <select
              className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sam-fg"
              value={lq.query.size}
              onChange={(e) => lq.setSize(Number(e.target.value) as AdminListPageSize)}
              disabled={loading}
              aria-label={ko ? "페이지 크기" : "Page size"}
            >
              {ADMIN_LIST_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {ko ? `${n}개씩` : `${n} / page`}
                </option>
              ))}
            </select>
          </nav>
        </>
      )}
    </div>
  );
}
