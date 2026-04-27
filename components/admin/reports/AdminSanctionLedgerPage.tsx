"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  getAdminSanctionLedgerFromDb,
  type AdminSanctionLedgerRow,
} from "@/lib/admin-reports/getAdminSanctionLedgerFromDb";
import { messageKeyForReportAction } from "@/lib/admin-reports/report-admin-i18n-keys";

function localeForLedger(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

export function AdminSanctionLedgerPage() {
  const { t, language } = useI18n();
  const [rows, setRows] = useState<AdminSanctionLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSanctionLedgerFromDb(200)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_sanction_ledger_title" />
      <p className="sam-text-body text-sam-muted">{t("admin_sanction_ledger_intro")}</p>
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_dashboard_loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_sanction_ledger_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[720px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_at")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_action")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_report_id")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_sanction_ledger_th_target_type")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_reason")}</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_sanction_ledger_th_status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mk = messageKeyForReportAction(r.action_type);
                const actionLabel = mk ? t(mk) : r.action_type;
                return (
                  <tr key={r.action_id} className="border-b border-sam-border-soft hover:bg-sam-app">
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {new Date(r.action_at).toLocaleString(localeForLedger(language))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-body-secondary text-sam-fg">
                        {actionLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/reports/${r.report_id}`}
                        className="font-medium text-signature hover:underline"
                      >
                        {r.report_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-sam-muted">{r.target_type}</td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">{r.reason_code}</td>
                    <td className="px-3 py-2.5 text-sam-muted">{r.report_status}</td>
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
