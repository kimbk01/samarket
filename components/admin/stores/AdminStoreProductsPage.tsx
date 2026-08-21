"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";

type Row = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  product_status: string;
  admin_review_status: string;
  thumbnail_url: string | null;
  created_at: string;
  store: { store_name: string; slug: string } | null;
};

const FILTERS: { value: string; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "admin_stores_product_filter_all" },
  { value: "active", labelKey: "admin_stores_product_filter_active" },
  { value: "draft", labelKey: "common_draft" },
  { value: "hidden", labelKey: "common_hidden" },
  { value: "blocked", labelKey: "common_block" },
  { value: "sold_out", labelKey: "admin_stores_product_filter_sold_out" },
];

export function AdminStoreProductsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (storeIdFilter) parts.push(`store_id=${encodeURIComponent(storeIdFilter)}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filter, storeIdFilter]);

  const errorText =
    error === "forbidden"
      ? t("admin_audit_err_no_permission")
      : error === "network_error"
        ? t("common_network_error")
        : error;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-products${qs}`, { credentials: "include" });
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
      setRows(json.products ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: string) => {
    const memo =
      action === "block" || action === "hide"
        ? (await dibayPrompt({ title: t("admin_stores_prompt_memo_optional"), defaultValue: "" }))?.trim() ||
          null
        : null;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, memo }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_products" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_products_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          store_id={storeIdFilter}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {t("admin_biz_cta_back_store")}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 sam-text-body-secondary font-medium ${
              filter === f.value
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {errorText ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {errorText}
        </div>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_stores_products_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[900px] w-full border-collapse text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border bg-sam-app sam-text-helper text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_product")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_store")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_review")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dis = busyId === r.id;
                return (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-sam-surface-muted">
                          {r.thumbnail_url ? (
                            <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <div className="font-medium text-sam-fg">{r.title}</div>
                          <div className="sam-text-helper text-sam-muted">
                            {typeof r.price === "number" ? formatMoneyPhp(r.price) : r.price}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top sam-text-helper text-sam-fg">
                      {r.store?.store_name ?? "-"}
                      <div className="sam-text-xxs text-sam-meta">/{r.store?.slug}</div>
                    </td>
                    <td className="px-3 py-2 align-top">{r.product_status}</td>
                    <td className="px-3 py-2 align-top sam-text-helper">{r.admin_review_status}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {r.product_status !== "blocked" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-left sam-text-helper text-red-900 disabled:opacity-50"
                            onClick={() => void run(r.id, "block")}
                          >
                            {t("common_block")}
                          </button>
                        )}
                        {r.product_status === "active" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-app px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, "hide")}
                          >
                            {t("common_hidden")}
                          </button>
                        )}
                        {(r.product_status === "active" || r.product_status === "hidden") && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left sam-text-helper text-amber-950 disabled:opacity-50"
                            onClick={() => void run(r.id, "sold_out")}
                          >
                            {t("admin_stores_product_sold_out")}
                          </button>
                        )}
                        {r.product_status !== "active" && r.product_status !== "deleted" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-green-200 bg-green-50 px-2 py-1 text-left sam-text-helper text-green-900 disabled:opacity-50"
                            onClick={() => void run(r.id, "activate")}
                          >
                            {t("admin_stores_product_activate")}
                          </button>
                        )}
                        {r.admin_review_status !== "approved" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, "approve_review")}
                          >
                            {t("admin_stores_product_approve_review")}
                          </button>
                        )}
                        {r.admin_review_status !== "rejected" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, "reject_review")}
                          >
                            {t("admin_stores_product_reject_review")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
