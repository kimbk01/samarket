"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  buyer_user_id: string;
  rating: number;
  content: string;
  status: string;
  created_at: string;
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
};

export function AdminStoreReviewsPage() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const locale = catalogDateLocale(language);

  const errorText =
    error === "forbidden"
      ? t("admin_audit_err_no_permission")
      : error === "table_missing"
        ? t("admin_stores_reviews_err_table_missing")
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
      const res = await fetch(`/api/admin/store-reviews${qs}`, { credentials: "include" });
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
      setRows(json.reviews ?? []);
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

  async function setStatus(id: string, status: "visible" | "hidden") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/store-reviews/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json?.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_reviews" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_reviews_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          store_id={storeIdFilter}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {t("admin_biz_cta_back_store")}
          </Link>
        </p>
      ) : null}
      {errorText ? <p className="text-sm text-red-700">{errorText}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_reviews_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-sam-fg">{r.store_name || r.store_id}</span>
                <span
                  className={
                    r.status === "visible" ? "text-xs text-green-700" : "text-xs text-sam-muted"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-sam-muted">
                {t("admin_stores_reviews_order_buyer", {
                  orderId: r.order_id,
                  buyerId: r.buyer_user_id,
                })}
              </p>
              <p className="mt-2 text-amber-800">{"★".repeat(r.rating)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              {r.owner_reply_content?.trim() ? (
                <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app p-2">
                  <p className="sam-text-helper font-semibold text-sam-fg">
                    {t("admin_stores_reviews_owner_reply")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap sam-text-body-secondary text-sam-fg">
                    {r.owner_reply_content}
                  </p>
                  {r.owner_reply_created_at ? (
                    <p className="mt-1 text-right sam-text-xxs text-sam-muted">
                      {new Date(r.owner_reply_created_at).toLocaleDateString(locale)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 sam-text-helper text-sam-meta">{t("admin_stores_reviews_no_owner_reply")}</p>
              )}
              <div className="mt-3 flex gap-2">
                {r.status === "visible" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "hidden")}
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs"
                  >
                    {t("common_hidden")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "visible")}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 text-xs text-white"
                  >
                    {t("admin_stores_reviews_restore_visible")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
