"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  notifStatusLabel,
  notifTargetLabel,
  notifTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

type CampaignRow = {
  id: string;
  title: string;
  type: string;
  target_type: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
};

export function AdminNotificationCampaignsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      if (type !== "all") sp.set("type", type);
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/notification-campaigns?${sp.toString()}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; campaigns?: CampaignRow[]; error?: string };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_load_list"));
        setRows([]);
        return;
      }
      setRows(j.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, type, q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-sam-fg">{t("admin_notif_page_list")}</h1>
        <Link
          href="/admin/notifications/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-sm font-medium text-white"
        >
          {t("admin_notif_btn_new")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">{t("admin_notif_filter_status_all")}</option>
          <option value="draft">{t("admin_notif_status_draft")}</option>
          <option value="scheduled">{t("admin_notif_status_scheduled")}</option>
          <option value="sent">{t("admin_notif_status_sent")}</option>
          <option value="failed">{t("admin_notif_status_failed")}</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">{t("admin_notif_filter_type_all")}</option>
          <option value="notice">{t("admin_notif_type_notice")}</option>
          <option value="marketing">{t("admin_notif_type_marketing")}</option>
          <option value="system">{t("admin_notif_type_system")}</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("admin_notif_ph_title_search")}
          className="min-w-[160px] flex-1 rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm"
        >
          {t("admin_notif_btn_search")}
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_notif_th_title")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_type")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_target")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_status")}</th>
                <th className="px-3 py-2">{t("admin_notif_detail_scheduled_at")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_sent_at")}</th>
                <th className="px-3 py-2">{t("admin_notif_detail_created_at")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 font-medium text-sam-fg">
                    <Link href={`/admin/notifications/${r.id}`} className="hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{notifTypeLabel(t, r.type)}</td>
                  <td className="px-3 py-2">{notifTargetLabel(t, r.target_type)}</td>
                  <td className="px-3 py-2">{notifStatusLabel(t, r.status)}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.scheduled_at ? r.scheduled_at.slice(0, 16) : "—"}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.sent_at ? r.sent_at.slice(0, 16) : "—"}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.created_at ? r.created_at.slice(0, 16) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sam-muted">
                    {t("admin_notif_empty_campaigns")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
