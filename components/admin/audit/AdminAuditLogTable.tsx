"use client";

import Link from "next/link";
import type { AdminAuditLog, AuditLogResult } from "@/lib/types/admin-audit";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import {
  AUDIT_CATEGORY_LABEL_KEYS,
  AUDIT_RESULT_LABEL_KEYS,
} from "@/lib/admin-audit/admin-audit-i18n-keys";

const RESULT_CLASS: Record<AuditLogResult, string> = {
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-50 text-red-700",
};

interface AdminAuditLogTableProps {
  logs: AdminAuditLog[];
}

export function AdminAuditLogTable({ logs }: AdminAuditLogTableProps) {
  const { t, language } = useI18n();

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_dt_id")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_dt_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_audit_th_action")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_audit_th_result")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_audit_th_admin")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_dt_target")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_audit_th_summary")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_audit_th_datetime")}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/audit-logs/${l.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {l.id}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {l.category === "auth"
                  ? t("admin_audit_category_auth_short")
                  : t(AUDIT_CATEGORY_LABEL_KEYS[l.category])}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.actionType}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${RESULT_CLASS[l.result]}`}
                >
                  {t(AUDIT_RESULT_LABEL_KEYS[l.result])}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.adminNickname}</td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-sam-muted">
                {l.targetLabel ?? l.targetId ?? "-"}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-muted">
                {l.summary}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminDateTime(l.createdAt, language)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
