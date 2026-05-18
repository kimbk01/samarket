"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

type Row = Record<string, unknown>;

export function AdminTradeAdPoliciesPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/trade-ad-products", { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; rows?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_trade_post_ads_list_load_failed"));
        setRows([]);
      } else {
        setRows(j.rows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (r: Row) => {
    const id = String(r.id ?? "");
    if (!id) return;
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-ad-products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_trade_ad_policies_save_failed"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader titleKey="admin_page_trade_ad_policies" descriptionKey="admin_trade_ad_policies_desc" />

      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_trade_ad_policies_apply_prefix")}{" "}
        <Link href="/admin/trade-post-ads" className="text-blue-700 underline">
          {t("admin_trade_ad_policies_apply_link")}
        </Link>{" "}
        {t("admin_trade_ad_policies_apply_suffix")}
      </p>

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      {loading ? (
        <p className="sam-text-body-secondary text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_trade_ad_policies_empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left sam-text-body-secondary">
            <thead className="bg-sam-surface-muted text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_name")}</th>
                <th className="px-3 py-2">board</th>
                <th className="px-3 py-2">placement</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_service")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_duration_days")}</th>
                <th className="px-3 py-2">{t("admin_trade_th_points")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_priority")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_active")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id ?? "");
                return (
                  <tr key={id} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2 font-medium text-sam-fg">{String(r.name ?? "")}</td>
                    <td className="px-3 py-2">{String(r.board_key ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.placement ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.service_type ?? t("admin_trade_ad_policies_service_all"))}</td>
                    <td className="px-3 py-2">{String(r.duration_days ?? "")}</td>
                    <td className="px-3 py-2">{String(r.point_cost ?? "")}</td>
                    <td className="px-3 py-2">{String(r.priority_default ?? "")}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busyId === id}
                        onClick={() => void toggleActive(r)}
                        className="rounded border border-sam-border px-2 py-0.5 sam-text-helper disabled:opacity-50"
                      >
                        {r.is_active ? t("admin_trade_ad_policies_toggle_off") : t("admin_trade_ad_policies_toggle_on")}
                      </button>
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
