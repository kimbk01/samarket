"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointChargeRequest, PointChargeRequestStatus } from "@/lib/types/point";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { AdminRequestPeriodSummaryLine } from "@/components/admin/finance/AdminRequestPeriodSummaryLine";
import type { AdminRequestPeriodSummary } from "@/lib/admin/finance/admin-request-period-summary";
import { pointChargeStatusLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import { AdminPointChargeInlineActions } from "./AdminPointChargeInlineActions";

const STATUS_VALUES: PointChargeRequestStatus[] = [
  "pending",
  "waiting_confirm",
  "on_hold",
  "approved",
  "rejected",
  "cancelled",
];

export function AdminPointChargeListPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery({ statuses: STATUS_VALUES, defaults: { size: 50 } });
  const action = useAdminRouteAction("/admin/point-charges");
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [total, setTotal] = useState(0);
  /** null = 받지 못함(실패) — 0 으로 보이지 않게 카드 값을 「—」로 비운다 (D-11 ①). */
  const [statusCounts, setStatusCounts] = useState<Partial<Record<PointChargeRequestStatus, number>> | null>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  /** H-10 — 고른 기간(신청 시각) 전체 합계 (서버 계산 · 상태·검색·쪽과 무관). */
  const [periodSummary, setPeriodSummary] = useState<AdminRequestPeriodSummary | null>(null);
  const [periodNotAppliedToSearch, setPeriodNotAppliedToSearch] = useState(false);
  /** R3-j — 상태 카드가 센 기간 (신청 시각 · 둘 다 null = 전체 기간). */
  const [statusCountsPeriod, setStatusCountsPeriod] = useState<{ fromDay: string | null; toDay: string | null } | null>(
    null
  );
  /** 기간을 골라도 「입금 확인 대기」 경고는 전체 기간 건수 (서버가 기간 있을 때만 따로 보냄). */
  const [waitingConfirmAllTime, setWaitingConfirmAllTime] = useState<number | null>(null);

  // Server-side status filter · search · pagination (no 300-row cap).
  const apiQuery = lq.apiQueryString;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(apiQuery);
        if (!params.get("status")) params.set("status", "all");
        params.set("counts", "1");
        params.set("summary", "1");
        const res = await fetch(`/api/admin/point-charges?${params.toString()}`, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          requests?: PointChargeRequest[];
          total?: number;
          statusCounts?: Partial<Record<PointChargeRequestStatus, number>>;
          statusCountsPeriod?: { fromDay: string | null; toDay: string | null };
          waitingConfirmAllTime?: number;
          periodSummary?: AdminRequestPeriodSummary | null;
          periodNotAppliedToSearch?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || json.ok === false) {
          setError({ code: json.error ?? "load_failed", httpStatus: res.status });
          setRequests([]);
          setTotal(0);
          // R8-g — 실패하면 이전 조건의 기간 합계를 남기지 않는다.
          setPeriodSummary(null);
          setPeriodNotAppliedToSearch(false);
          // D-11 ① — 실패하면 이전 조건의 상태 카드 숫자도 남기지 않는다.
          setStatusCounts(null);
          setStatusCountsPeriod(null);
          setWaitingConfirmAllTime(null);
          return;
        }
        const rows = json.requests ?? [];
        setRequests(rows);
        setTotal(json.total ?? rows.length);
        if (json.statusCounts) {
          setStatusCounts(json.statusCounts);
          setStatusCountsPeriod(json.statusCountsPeriod ?? { fromDay: null, toDay: null });
        }
        setWaitingConfirmAllTime(typeof json.waitingConfirmAllTime === "number" ? json.waitingConfirmAllTime : null);
        setPeriodSummary(json.periodSummary ?? null);
        setPeriodNotAppliedToSearch(json.periodNotAppliedToSearch === true);
      } catch {
        if (!cancelled) {
          setError({ code: "network_error" });
          setRequests([]);
          setTotal(0);
          setPeriodSummary(null);
          setPeriodNotAppliedToSearch(false);
          setStatusCounts(null);
          setStatusCountsPeriod(null);
          setWaitingConfirmAllTime(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiQuery, lq.refreshKey, reloadNonce]);

  const countOf = (s: PointChargeRequestStatus) => statusCounts?.[s] ?? 0;
  const counts = {
    total: Object.values(statusCounts ?? {}).reduce((n, v) => n + (v ?? 0), 0),
    waiting: countOf("waiting_confirm"),
    pending: countOf("pending"),
    approved: countOf("approved"),
    rejected: countOf("rejected"),
  };
  /** 경고 줄: 기간을 골랐으면 서버의 전체 기간 대기 건수, 아니면 카드 값(= 전체 기간). */
  const waitingAlertCount = waitingConfirmAllTime ?? counts.waiting;
  const cardsRange =
    statusCountsPeriod && (statusCountsPeriod.fromDay || statusCountsPeriod.toDay)
      ? `${statusCountsPeriod.fromDay ?? "…"} ~ ${statusCountsPeriod.toDay ?? "…"} (PHT)`
      : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_charge" />

      {/* summary cards — R3-j: 카드가 센 기간을 적는다 (기간 없음 = 전체 기간) */}
      <p className="sam-text-helper text-sam-muted" data-admin-point-charge-cards-period="1">
        {cardsRange
          ? ko
            ? `상태별 건수 · 신청 기준 ${cardsRange} · 현재 상태`
            : `Counts by status · requested ${cardsRange} · current status`
          : ko
            ? "상태별 건수 · 전체 기간 · 현재 상태"
            : "Counts by status · all time · current status"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: t("admin_points_charge_summary_total"), value: counts.total, color: "text-sam-fg" },
          { label: t("admin_points_charge_status_waiting_confirm"), value: counts.waiting, color: "text-sam-warning" },
          { label: t("admin_points_charge_summary_pending"), value: counts.pending, color: "text-sam-info" },
          { label: t("admin_points_charge_summary_approved"), value: counts.approved, color: "text-sam-success" },
          { label: t("admin_points_charge_status_rejected"), value: counts.rejected, color: "text-sam-danger" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className={`sam-text-hero font-bold tabular-nums ${color}`}>
              {statusCounts ? formatAdminNumber(value) : "—"}
            </p>
            <p className="sam-text-xxs text-sam-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* deposit confirmation alert */}
      {waitingAlertCount > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
          <span className="sam-text-body-lg" aria-hidden>
            ⚠️
          </span>
          <span>{t("admin_points_charge_alert_waiting", { count: waitingAlertCount })}</span>
        </div>
      )}

      <AdminFilterBar
        ko={ko}
        requireCompletePeriod
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={loading}
        searchPlaceholder={t("admin_points_charge_search_placeholder")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: STATUS_VALUES.map((s) => ({ value: s, label: pointChargeStatusLabel(t, s) })),
        }}
      />

      <AdminRequestPeriodSummaryLine
        ko={ko}
        summary={loading ? null : periodSummary}
        formatAmount={(n) => `${formatAdminNumber(n)}P`}
        formatAmount2={(n) => formatAdminPhp(n)}
        note={
          periodNotAppliedToSearch
            ? ko
              ? "닉네임·입금자명 검색 결과에는 기간이 적용되지 않습니다 (기간 합계는 위 기간 기준)."
              : "The period is not applied to nickname/depositor search results (totals above use the period)."
            : null
        }
      />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `처리 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">{ko ? "충전 신청 목록" : "Top-up requests"}</h2>
          <span className="sam-text-body-secondary tabular-nums text-sam-muted">
            {ko ? `총 ${formatAdminNumber(total)}건` : `${formatAdminNumber(total)} total`}
          </span>
        </div>
        <div className="p-4">
          {loading ? (
            <AdminLoadingState ko={ko} />
          ) : error ? (
            <AdminErrorState
              ko={ko}
              code={error.code}
              httpStatus={error.httpStatus}
              onRetry={() => setReloadNonce((n) => n + 1)}
            />
          ) : requests.length === 0 ? (
            <AdminEmptyState
              ko={ko}
              message={lq.isFiltered ? undefined : t("admin_points_charge_empty_list")}
              onReset={lq.isFiltered ? lq.reset : undefined}
            />
          ) : (
            <AdminPointChargeInlineActions
              requests={requests}
              onActionSuccess={() => setReloadNonce((n) => n + 1)}
              actionAllowed={action.allowed}
            />
          )}
        </div>
        {total > 0 ? (
          <div className="border-t border-sam-border-soft px-4">
            <AdminPagination
              ko={ko}
              page={lq.query.page}
              size={lq.query.size}
              total={total}
              onPageChange={lq.setPage}
              onSizeChange={lq.setSize}
              disabled={loading}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
