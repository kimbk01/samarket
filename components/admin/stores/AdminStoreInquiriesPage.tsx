"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  from_user_id: string;
  inquiry_type: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  open: "admin_stores_inquiries_status_open",
  answered: "admin_stores_inquiries_status_answered",
  closed: "admin_stores_inquiries_status_closed",
  escalated: "admin_stores_inquiries_status_escalated",
};

export function AdminStoreInquiriesPage() {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const errorText = useMemo(() => {
    if (!error) return null;
    if (error === "forbidden") return t("admin_audit_err_no_permission");
    if (error === "network_error") return t("common_network_error");
    return error;
  }, [error, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-inquiries", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(json.inquiries ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_inquiries" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_inquiries_desc")}</p>

      {errorText ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-800">{errorText}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_inquiries_empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article
              key={r.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-2 sam-text-body-secondary">
                <span className="font-semibold text-sam-fg">{r.store_name || r.store_id}</span>
                <span className="text-sam-muted">
                  {STATUS_LABEL_KEYS[r.status] ? t(STATUS_LABEL_KEYS[r.status]) : r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-sam-muted">
                {t("admin_stores_inquiries_reporter")}{" "}
                <span className="font-mono">{r.from_user_id}</span> · {r.inquiry_type} ·{" "}
                {new Date(r.created_at).toLocaleString(locale)}
              </p>
              <p className="mt-2 font-medium text-sam-fg">{r.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              {r.answer ? (
                <div className="mt-3 rounded-ui-rect bg-sam-app p-3 text-sm text-sam-fg">
                  <p className="text-xs font-medium text-sam-muted">{t("admin_stores_inquiries_store_reply")}</p>
                  <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                  {r.answered_at ? (
                    <p className="mt-1 sam-text-xxs text-sam-meta">
                      {new Date(r.answered_at).toLocaleString(locale)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
