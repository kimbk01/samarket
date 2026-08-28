"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";
import { parseAdminStoreReportFocusRequestId } from "@/lib/admin/admin-ops-deeplink";

type Row = {
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
  action_type: string | null;
  action_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export function AdminStoreReportsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const focusRequestId = parseAdminStoreReportFocusRequestId(searchParams);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [memoById, setMemoById] = useState<Record<string, string>>({});
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const errorText =
    error === "forbidden"
      ? t("admin_audit_err_no_permission")
      : error === "table_missing"
        ? t("admin_stores_reports_err_table_missing")
        : error === "network_error"
          ? t("common_network_error")
          : error;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = storeIdFilter
        ? `?store_id=${encodeURIComponent(storeIdFilter)}`
        : "";
      const res = await fetch(`/api/admin/store-reports${qs}`, { credentials: "include" });
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
      setRows(json.reports ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = focusRequestId.trim();
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400");
      const timeoutId = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-amber-400");
      }, 2500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [focusRequestId, rows]);

  async function patchStatus(id: string, status: "dismissed" | "actioned") {
    setBusyId(id);
    try {
      const memo = (memoById[id] ?? "").trim();
      const res = await fetch(`/api/admin/store-reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          action_memo: memo || null,
          action_type: status === "dismissed" ? "dismiss" : "action",
        }),
      });
      const json = await res.json();
      if (json?.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_reports" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_reports_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          store_id={storeIdFilter}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {t("admin_biz_cta_back_store")}
          </Link>
          {" · "}
          <Link href="/admin/store-reports" className="text-signature hover:underline">
            {t("admin_do_common_clear_store_filter")}
          </Link>
        </p>
      ) : null}
      {errorText ? <p className="text-sm text-red-700">{errorText}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_reports_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              ref={(el) => {
                rowRefs.current[r.id] = el;
              }}
              data-testid={focusRequestId === r.id ? "admin-store-report-focused" : undefined}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-sam-fg">
                  {r.store_name || r.store_id}
                  {r.target_type === "product" && r.product_title ? (
                    <span className="block text-xs font-normal text-sam-muted">
                      {t("admin_stores_reports_product_prefix", { title: r.product_title })}
                    </span>
                  ) : null}
                </span>
                <span
                  className={
                    r.status === "open"
                      ? "text-xs text-amber-700"
                      : r.status === "actioned"
                        ? "text-xs text-green-700"
                        : "text-xs text-sam-muted"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-sam-muted">
                {t("admin_stores_reports_meta", {
                  targetType: r.target_type,
                  targetId: r.target_id,
                  reporterId: r.reporter_user_id,
                })}
              </p>
              <p className="mt-1 text-xs text-sam-muted">
                {t("admin_stores_reports_reason", { reason: r.reason_type })}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-sam-fg">{r.message}</p>
              {r.status !== "open" ? (
                <p className="mt-2 text-xs text-sam-muted">
                  {t("admin_stores_reports_reviewed", {
                    reviewedAt: r.reviewed_at ?? "-",
                    memo: r.action_memo ?? r.action_type ?? "",
                  })}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    className="w-full rounded-ui-rect border border-sam-border px-2 py-1.5 text-xs"
                    placeholder={t("admin_stores_reports_memo_ph")}
                    value={memoById[r.id] ?? ""}
                    onChange={(e) => setMemoById((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-sam-fg disabled:opacity-50"
                      onClick={() => void patchStatus(r.id, "dismissed")}
                    >
                      {t("admin_stores_reports_dismiss")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect bg-sam-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      onClick={() => void patchStatus(r.id, "actioned")}
                    >
                      {t("admin_stores_reports_actioned")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
