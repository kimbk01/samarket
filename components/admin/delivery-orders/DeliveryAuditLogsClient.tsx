"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string;
  target_type: string;
  target_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  created_at: string;
};

function jsonBrief(x: unknown): string {
  if (x == null) return "—";
  try {
    const s = JSON.stringify(x);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

export function DeliveryAuditLogsClient() {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-logs?target_type=store_order&limit=200", {
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; logs?: AuditRow[] };
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? t("admin_do_audit_table_missing") : json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.logs) ? json.logs : []);
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
      <AdminPageHeader titleKey="admin_do_audit_title" backHref="/admin/stores/orders" />
      <p className="mb-3 sam-text-body-secondary text-sam-muted">
        <code className="rounded bg-sam-app px-1 sam-text-helper">target_type = store_order</code>{" "}
        {t("admin_do_audit_intro")}{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          {t("admin_do_audit_menu")}
        </Link>
        {t("admin_do_audit_menu_suffix")}
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
      <AdminCard titleKey="admin_do_audit_card">
        {loading ? (
          <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-sam-muted">{t("admin_do_common_no_records")}</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full min-w-[960px] border-collapse sam-text-helper">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
                  <th className="px-2 py-2">{t("admin_do_th_time")}</th>
                  <th className="px-2 py-2">{t("admin_do_common_order")}</th>
                  <th className="px-2 py-2">{t("admin_do_th_actor")}</th>
                  <th className="px-2 py-2">{t("admin_do_common_action")}</th>
                  <th className="px-2 py-2">before</th>
                  <th className="px-2 py-2">after</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app/60">
                    <td className="whitespace-nowrap px-2 py-2 text-sam-muted">
                      {new Date(r.created_at).toLocaleString(doAdminLocale(language))}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/admin/stores/orders/${encodeURIComponent(r.target_id)}`}
                        className="font-mono text-signature underline"
                      >
                        {r.target_id}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      {r.actor_type}
                      <span className="text-sam-meta"> · </span>
                      <span className="font-mono sam-text-xxs">{r.actor_id}</span>
                    </td>
                    <td className="px-2 py-2 font-medium">{r.action}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-sam-muted" title={jsonBrief(r.before_json)}>
                      {jsonBrief(r.before_json)}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-sam-muted" title={jsonBrief(r.after_json)}>
                      {jsonBrief(r.after_json)}
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
