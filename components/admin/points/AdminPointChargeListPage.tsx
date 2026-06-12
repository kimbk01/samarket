"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  filterPointChargeRequests,
  type AdminPointChargeFilters,
} from "@/lib/points/point-utils";
import type { PointChargeRequest } from "@/lib/types/point";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPointChargeFilterBar } from "./AdminPointChargeFilterBar";
import { AdminPointChargeInlineActions } from "./AdminPointChargeInlineActions";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

const DEFAULT_FILTERS: AdminPointChargeFilters = {
  requestStatus: "",
};

export function AdminPointChargeListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminPointChargeFilters>(DEFAULT_FILTERS);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/point-charges", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        requests?: PointChargeRequest[];
      };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        setRequests([]);
        return;
      }
      setRequests(json.requests ?? []);
    } catch {
      setErr(t("common_network_error"));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => filterPointChargeRequests(requests, filters),
    [requests, filters]
  );

  const counts = {
    total: requests.length,
    waiting: requests.filter((r) => r.requestStatus === "waiting_confirm").length,
    pending: requests.filter((r) => r.requestStatus === "pending").length,
    approved: requests.filter((r) => r.requestStatus === "approved").length,
    rejected: requests.filter((r) => r.requestStatus === "rejected").length,
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_points_charge_page_list" />

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

      <AdminPointChargeFilterBar filters={filters} onChange={setFilters} />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {t("admin_points_charge_list_title", { count: filtered.length })}
          </h2>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="py-10 text-center sam-text-body-secondary text-sam-meta">{t("common_loading")}</p>
          ) : (
            <AdminPointChargeInlineActions requests={filtered} onActionSuccess={load} />
          )}
        </div>
      </div>
    </div>
  );
}
