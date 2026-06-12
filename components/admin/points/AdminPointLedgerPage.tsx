"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointLedgerTypeLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import type { PointLedgerEntry } from "@/lib/types/point";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

export function AdminPointLedgerPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<PointLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/points/ledger", { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; error?: string; entries?: PointLedgerEntry[] };
      if (!res.ok || json.ok === false) {
        setEntries([]);
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_points_err_action_failed"));
        return;
      }
      setEntries(json.entries ?? []);
    } catch {
      setEntries([]);
      setErr(t("common_network_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_points_ledger_page")}</h1>
      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      {loading ? (
        <p className="py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : entries.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_points_ledger_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_user")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_amount")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_balance")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_description")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_datetime")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                  <td className="px-3 py-2.5">
                    {e.userNickname} ({e.userId})
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{pointLedgerTypeLabel(t, e.entryType)}</td>
                  <td
                    className={`px-3 py-2.5 font-medium ${
                      e.amount > 0 ? "text-emerald-600" : "text-sam-fg"
                    }`}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount}P
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">{e.balanceAfter}P</td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-muted">{e.description}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
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
