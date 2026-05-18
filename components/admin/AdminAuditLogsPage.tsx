"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Row = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  created_at: string;
};

function JsonBlock({ label, v }: { label: string; v: unknown }) {
  if (v == null) return null;
  const s = JSON.stringify(v, null, 2);
  if (s === "null" || s === "{}") return null;
  return (
    <details className="mt-1 text-left">
      <summary className="cursor-pointer sam-text-xxs text-sam-muted">{label}</summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-sam-app p-2 sam-text-xxs text-sam-fg">
        {s}
      </pre>
    </details>
  );
}

export function AdminAuditLogsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filter.trim()) q.set("target_type", filter.trim());
      const res = await fetch(`/api/admin/audit-logs?${q.toString()}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError(t("admin_audit_err_no_permission"));
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(
          json?.error === "table_missing"
            ? t("admin_audit_err_table_missing")
            : (json?.error as string | undefined) ?? t("admin_audit_load_failed")
        );
        setRows([]);
        return;
      }
      setRows(json.logs ?? []);
    } catch {
      setError(t("admin_audit_err_network"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_log_audit" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_audit_legacy_desc")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-sam-muted">{t("admin_audit_filter_target_type")}</span>
          <input
            className="mt-0.5 block rounded-ui-rect border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_audit_filter_target_placeholder")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect bg-sam-ink px-3 py-1.5 text-sm text-white"
        >
          {t("admin_audit_query_btn")}
        </button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_audit_no_logs")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono sam-text-xxs text-sam-muted">{r.created_at}</span>
                <span className="text-xs text-sam-muted">
                  {r.actor_type}
                  {r.actor_id ? ` · ${r.actor_id.slice(0, 8)}…` : ""}
                </span>
              </div>
              <Link href={`/admin/audit-logs/${r.id}`} className="mt-1 block font-medium text-sam-fg hover:text-signature">
                {r.action}
              </Link>
              <p className="text-xs text-sam-muted">
                {r.target_type} · <span className="font-mono">{r.target_id}</span>
                {r.ip ? ` · ${r.ip}` : ""}
              </p>
              <JsonBlock label={t("admin_audit_json_before")} v={r.before_json} />
              <JsonBlock label={t("admin_audit_json_after")} v={r.after_json} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
