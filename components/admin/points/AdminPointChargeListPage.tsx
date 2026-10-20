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
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
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
  const [statusCounts, setStatusCounts] = useState<Partial<Record<PointChargeRequestStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

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
        const res = await fetch(`/api/admin/point-charges?${params.toString()}`, { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          requests?: PointChargeRequest[];
          total?: number;
          statusCounts?: Partial<Record<PointChargeRequestStatus, number>>;
        };
        if (cancelled) return;
        if (!res.ok || json.ok === false) {
          setError({ code: json.error ?? "load_failed", httpStatus: res.status });
          setRequests([]);
          setTotal(0);
          return;
        }
        const rows = json.requests ?? [];
        setRequests(rows);
        setTotal(json.total ?? rows.length);
        if (json.statusCounts) setStatusCounts(json.statusCounts);
      } catch {
        if (!cancelled) {
          setError({ code: "network_error" });
          setRequests([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiQuery, lq.refreshKey, reloadNonce]);

  const countOf = (s: PointChargeRequestStatus) => statusCounts[s] ?? 0;
  const counts = {
    total: Object.values(statusCounts).reduce((n, v) => n + (v ?? 0), 0),
    waiting: countOf("waiting_confirm"),
    pending: countOf("pending"),
    approved: countOf("approved"),
    rejected: countOf("rejected"),
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_charge" />

      {/* summary cards */}
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
            <p className={`sam-text-hero font-bold tabular-nums ${color}`}>{formatAdminNumber(value)}</p>
            <p className="sam-text-xxs text-sam-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* deposit confirmation alert */}
      {counts.waiting > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
          <span className="sam-text-body-lg" aria-hidden>
            ⚠️
          </span>
          <span>{t("admin_points_charge_alert_waiting", { count: counts.waiting })}</span>
        </div>
      )}

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        pending={loading}
        searchPlaceholder={t("admin_points_charge_search_placeholder")}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: STATUS_VALUES.map((s) => ({ value: s, label: pointChargeStatusLabel(t, s) })),
        }}
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
