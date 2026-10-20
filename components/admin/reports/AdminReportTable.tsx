"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { Report } from "@/lib/types/report";
import { REPORT_TARGET_TYPE_LABEL_KEYS } from "@/lib/admin-reports/report-admin-i18n-keys";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { MEMBERS_REPORT_STATUS_NS } from "@/lib/admin/status-labels/members-status-labels";

interface AdminReportTableProps {
  reports: Report[];
}

export function AdminReportTable({ reports }: AdminReportTableProps) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_id")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_source")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_date")} (PHT)</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_reporter")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_target_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_target_party")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_product")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_reason")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_report_th_resolver")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_report_th_detail")}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="max-w-[90px] truncate px-3 py-2.5 font-mono sam-text-helper text-sam-muted">
                <AdminTechId id={r.id} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-helper text-sam-muted">
                {r.reportSource === "community_feed"
                  ? safeT("admin_report_source_feed", {
                      fallbackKo: "Community · community_reports",
                      fallbackEn: "Community · community_reports",
                    })
                  : safeT("admin_report_source_db", {
                      fallbackKo: "Trade · reports",
                      fallbackEn: "Trade · reports",
                    })}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(r.createdAt)}
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 text-sam-fg">
                {r.reporterNickname ?? r.reporterId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(REPORT_TARGET_TYPE_LABEL_KEYS[r.targetType] ?? "admin_report_target_user")}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-sam-fg">
                {r.targetTitle ?? r.targetId}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {r.productTitle ?? "-"}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-sam-fg">{r.reasonLabel}</td>
              <td className="px-3 py-2.5">
                <AdminStatusLabel namespace={MEMBERS_REPORT_STATUS_NS} code={r.status} ko={ko} />
              </td>
              <td className="max-w-[80px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {r.resolvedBy ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={r.adminDetailHref ?? `/admin/reports/${r.id}`}
                  className="sam-text-body-secondary font-medium text-signature hover:underline"
                >
                  {t("admin_report_detail_cta")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
