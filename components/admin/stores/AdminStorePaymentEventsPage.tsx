"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  source: string;
  order_id: string | null;
  event_type: string;
  provider: string | null;
  transmission_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type Filters = { orderId: string; source: string; eventType: string };

export function AdminStorePaymentEventsPage() {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Filters>({ orderId: "", source: "", eventType: "" });
  const [draft, setDraft] = useState<Filters>({ orderId: "", source: "", eventType: "" });

  const errorText = useMemo(() => {
    if (!error) return null;
    if (error === "forbidden") return t("admin_audit_err_no_permission");
    if (error === "table_missing") return t("admin_stores_payment_err_table_missing");
    if (error === "network_error") return t("common_network_error");
    return error;
  }, [error, t]);

  const fetchWith = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const o = f.orderId.trim();
      const s = f.source.trim();
      const e = f.eventType.trim();
      if (o) params.set("order_id", o);
      if (s) params.set("source", s);
      if (e) params.set("event_type", e);
      const qs = params.toString();
      const res = await fetch(`/api/admin/store-payment-events${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "table_missing" : json?.error);
        setRows([]);
        return;
      }
      setRows(json.events ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWith(applied);
  }, [applied, fetchWith]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_payment_events" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_payment_desc")}</p>

      <div className="flex flex-wrap items-end gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body-secondary">
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">order_id</span>
          <input
            className="min-w-[200px] rounded border border-sam-border bg-sam-surface px-2 py-1 font-mono sam-text-helper"
            value={draft.orderId}
            onChange={(ev) => setDraft((d) => ({ ...d, orderId: ev.target.value }))}
            placeholder="UUID"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">{t("admin_stores_payment_filter_source")}</span>
          <input
            className="min-w-[120px] rounded border border-sam-border bg-sam-surface px-2 py-1"
            value={draft.source}
            onChange={(ev) => setDraft((d) => ({ ...d, source: ev.target.value }))}
            placeholder="webhook, admin…"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">{t("admin_stores_payment_filter_event")}</span>
          <input
            className="min-w-[140px] rounded border border-sam-border bg-sam-surface px-2 py-1"
            value={draft.eventType}
            onChange={(ev) => setDraft((d) => ({ ...d, eventType: ev.target.value }))}
            placeholder="confirm, paid…"
          />
        </label>
        <button
          type="button"
          className="rounded bg-sam-ink px-3 py-1.5 text-white hover:bg-sam-surface-dark"
          onClick={() => setApplied({ ...draft })}
          disabled={loading}
        >
          {loading ? t("admin_stores_orders_querying") : t("admin_audit_query_btn")}
        </button>
      </div>

      {errorText ? <p className="text-sm text-red-700">{errorText}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_payment_empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface sam-text-helper">
          <table className="min-w-full text-left">
            <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2">{t("admin_stores_payment_th_time")}</th>
                <th className="px-2 py-2">source</th>
                <th className="px-2 py-2">event</th>
                <th className="px-2 py-2">order</th>
                <th className="px-2 py-2">provider</th>
                <th className="min-w-[72px] px-2 py-2">{t("admin_stores_payment_th_detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-sam-muted">
                    {new Date(r.created_at).toLocaleString(locale)}
                  </td>
                  <td className="px-2 py-2">{r.source}</td>
                  <td className="max-w-[180px] break-words px-2 py-2" title={r.event_type}>
                    {r.event_type}
                  </td>
                  <td className="max-w-[140px] px-2 py-2 font-mono sam-text-xxs break-all">
                    {r.order_id ? (
                      <Link
                        href={`/admin/store-orders?order_id=${encodeURIComponent(r.order_id)}`}
                        className="text-blue-700 underline hover:text-blue-900"
                        title={t("admin_stores_payment_open_order")}
                      >
                        {r.order_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2">{r.provider ?? "—"}</td>
                  <td className="px-2 py-2">
                    <details className="text-left">
                      <summary className="cursor-pointer select-none text-blue-700 hover:underline">
                        {t("admin_stores_payment_expand")}
                      </summary>
                      <div className="mt-2 max-w-[min(100vw-2rem,42rem)] space-y-1 sam-text-xxs text-sam-muted">
                        {r.transmission_id ? (
                          <p>
                            <span className="font-medium text-sam-fg">transmission_id</span>{" "}
                            <span className="font-mono break-all">{r.transmission_id}</span>
                          </p>
                        ) : null}
                        <pre className="max-h-64 overflow-auto rounded border border-sam-border bg-sam-app p-2 font-mono sam-text-xxs leading-relaxed">
                          {JSON.stringify(r.payload ?? {}, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
