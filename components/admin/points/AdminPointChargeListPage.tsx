"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminPointChargeFilters } from "@/lib/points/point-utils";
import type { PointChargeRequest, PointChargeRequestStatus } from "@/lib/types/point";
import { adminListPageCount } from "@/lib/admin/pagination/parse-admin-list-page";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPointChargeFilterBar } from "./AdminPointChargeFilterBar";
import { AdminPointChargeInlineActions } from "./AdminPointChargeInlineActions";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

const DEFAULT_FILTERS: AdminPointChargeFilters = {
  requestStatus: "",
};

const PAGE_SIZE = 50;

export function AdminPointChargeListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminPointChargeFilters>(DEFAULT_FILTERS);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Partial<Record<PointChargeRequestStatus, number>>>({});
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Server-side status filter · search · pagination (no 300-row cap).
  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({
        status: filters.requestStatus || "all",
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        counts: "1",
      });
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/point-charges?${params.toString()}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        requests?: PointChargeRequest[];
        total?: number;
        statusCounts?: Partial<Record<PointChargeRequestStatus, number>>;
      };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        setRequests([]);
        setTotal(0);
        return;
      }
      const rows = json.requests ?? [];
      setRequests(rows);
      setTotal(json.total ?? rows.length);
      if (json.statusCounts) setStatusCounts(json.statusCounts);
    } catch {
      setErr(t("common_network_error"));
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [t, filters.requestStatus, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFiltersChange = (next: AdminPointChargeFilters) => {
    setFilters(next);
    setPage(1);
  };
  const commitSearch = () => {
    setSearch(searchDraft.trim());
    setPage(1);
  };
  const pages = adminListPageCount(total, PAGE_SIZE);

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
          { label: t("admin_points_charge_status_waiting_confirm"), value: counts.waiting, color: "text-amber-700" },
          { label: t("admin_points_charge_summary_pending"), value: counts.pending, color: "text-blue-700" },
          { label: t("admin_points_charge_summary_approved"), value: counts.approved, color: "text-emerald-700" },
          { label: t("admin_points_charge_status_rejected"), value: counts.rejected, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className={`sam-text-hero font-bold ${color}`}>{value}</p>
            <p className="sam-text-xxs text-sam-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* deposit confirmation alert */}
      {counts.waiting > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          <span className="sam-text-body-lg">⚠️</span>
          <span>{t("admin_points_charge_alert_waiting", { count: counts.waiting })}</span>
        </div>
      )}

      {err ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-700">
          {err}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <AdminPointChargeFilterBar filters={filters} onChange={onFiltersChange} />
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            commitSearch();
          }}
        >
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t("admin_points_charge_search_placeholder")}
            className="min-w-[14rem] rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          />
          <button
            type="submit"
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          >
            {t("common_search")}
          </button>
        </form>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {t("admin_points_charge_list_title", { count: total })}
          </h2>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="py-10 text-center sam-text-body-secondary text-sam-meta">{t("common_loading")}</p>
          ) : (
            <AdminPointChargeInlineActions requests={requests} onActionSuccess={load} />
          )}
        </div>
        {total > PAGE_SIZE || page > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-sam-border-soft px-4 py-3 sam-text-body-secondary text-sam-muted">
            <span>{t("admin_points_charge_page_status", { page, pages })}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg disabled:opacity-40"
              >
                {t("admin_points_charge_page_prev")}
              </button>
              <button
                type="button"
                disabled={loading || page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg disabled:opacity-40"
              >
                {t("admin_points_charge_page_next")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
