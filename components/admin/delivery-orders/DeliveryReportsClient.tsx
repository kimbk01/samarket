"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

type StoreReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  store_id: string;
  store_name: string;
  product_title: string | null;
  reason_type: string;
  message: string;
  status: string;
  created_at: string;
};

export function DeliveryReportsClient() {
  const { t, safeT, language } = useI18n();
  const [rows, setRows] = useState<StoreReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-reports", { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; error?: string; reports?: StoreReportRow[] };
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? t("admin_do_reports_table_missing") : json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.reports) ? json.reports : []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader titleKey="admin_do_reports_title" backHref="/admin/stores/orders" />
      <p
        className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
        data-testid="admin-delivery-report-authority-banner"
      >
        {t("admin_do_reports_intro")}{" "}
        <code className="rounded bg-sam-app px-1">store_reports</code>
        {" · "}
        {safeT("admin_do_reports_same_authority", {
          fallbackKo: "동일 authority. 조치 콘솔:",
          fallbackEn: "Same authority. Action console:",
        })}{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          {t("admin_do_reports_console")}
        </Link>
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_do_common_load_failed", { error })}
        </p>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}
        </button>
      </div>
      <AdminCard titleKey="admin_do_reports_card">
        {loading ? (
          <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("admin_do_reports_empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full min-w-[900px] border-collapse sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
                  <th className="px-2 py-2">{t("admin_do_th_report_id_short")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_store")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_target")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_reason")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_status")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_received")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className="px-2 py-2 font-mono sam-text-helper">{r.id}</td>
                    <td className="max-w-[160px] truncate px-2 py-2">{r.store_name || r.store_id}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.target_type}
                      <span className="text-sam-meta"> · </span>
                      <span className="font-mono">{r.target_id}</span>
                      {r.product_title ? (
                        <span className="mt-0.5 block text-sam-muted">{t("admin_do_reports_product", { title: r.product_title })}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] px-2 py-2">
                      <span className="text-xs text-sam-muted">{r.reason_type}</span>
                      <p className="mt-0.5 line-clamp-2 text-sam-fg">{r.message}</p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{r.status}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-sam-muted">
                      {new Date(r.created_at).toLocaleString(doAdminLocale(language))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
