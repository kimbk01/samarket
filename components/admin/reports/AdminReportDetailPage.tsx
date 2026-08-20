"use client";

import { useCallback, useState, useEffect } from "react";
import type { Report } from "@/lib/types/report";
import { getReportByIdFromDb } from "@/lib/admin-reports/getReportsFromDb";
import { getReportActionsFromDb } from "@/lib/admin-reports/getReportActionsFromDb";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import Link from "next/link";
import { AdminSanctionPanel } from "./AdminSanctionPanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  REPORT_STATUS_LABEL_KEYS,
  REPORT_TARGET_TYPE_LABEL_KEYS,
  messageKeyForReportAction,
} from "@/lib/admin-reports/report-admin-i18n-keys";

interface AdminReportDetailPageProps {
  reportId: string;
}

function localeForDetail(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

export function AdminReportDetailPage({ reportId }: AdminReportDetailPageProps) {
  const { t, language } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLogs, setActionLogs] = useState<
    Awaited<ReturnType<typeof getReportActionsFromDb>>
  >([]);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [data, logs] = await Promise.all([
        getReportByIdFromDb(reportId),
        getReportActionsFromDb(reportId),
      ]);
      setReport(data ?? null);
      setActionLogs(logs);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  if (loading && !report) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_dashboard_loading")}</div>
    );
  }

  if (!report) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_report_not_found")}</div>
    );
  }

  const targetTypeKey = REPORT_TARGET_TYPE_LABEL_KEYS[report.targetType] ?? "admin_report_target_user";
  const statusKey = REPORT_STATUS_LABEL_KEYS[report.status];

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_report_detail_title" backHref="/admin/reports" />

      <AdminCard titleKey="admin_report_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_id")}</dt>
            <dd className="font-medium text-sam-fg">{report.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_type")}</dt>
            <dd>{t(targetTypeKey)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_target")}</dt>
            <dd className="truncate">{report.targetTitle ?? report.targetId}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_reason")}</dt>
            <dd>
              {report.reasonLabel}
              {report.detail ? (
                <span className="mt-1 block whitespace-pre-wrap sam-text-body-secondary text-sam-muted">
                  {report.detail}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_status")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                  report.status === "pending" || report.status === "reviewing"
                    ? "bg-amber-100 text-amber-800"
                    : report.status === "rejected" || report.status === "sanctioned"
                      ? "bg-red-50 text-red-700"
                      : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                {statusKey ? t(statusKey) : report.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_reported_at")}</dt>
            <dd>{new Date(report.createdAt).toLocaleString(localeForDetail(language))}</dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_report_card_parties">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_reporter")}</dt>
            <dd>
              {report.reporterId ? (
                <Link
                  href={`/admin/users/${report.reporterId}`}
                  className="text-signature hover:underline"
                  prefetch={false}
                >
                  {report.reporterNickname ?? report.reporterId}
                </Link>
              ) : (
                (report.reporterNickname ?? "—")
              )}{" "}
              {report.reporterId ? (
                <span className="font-mono sam-text-body-secondary text-sam-muted">
                  ({report.reporterId})
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_report_dt_target_user")}</dt>
            <dd className="font-mono sam-text-body-secondary">
              {report.targetUserId ? (
                <Link
                  href={`/admin/users/${report.targetUserId}`}
                  className="text-signature hover:underline"
                  prefetch={false}
                >
                  {report.targetUserId}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {report.targetType === "product" && report.targetId && (
            <div>
              <dt className="text-sam-muted">{t("admin_report_dt_post")}</dt>
              <dd className="flex flex-wrap gap-3">
                <Link
                  href={`/post/${report.targetId}`}
                  className="text-signature hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin_report_link_open_post")}
                </Link>
                <Link
                  href={`/admin/products/${report.targetId}`}
                  className="text-signature hover:underline"
                  prefetch={false}
                >
                  {t("admin_report_link_posts_admin_list")}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_report_card_resolve">
        <p className="mb-3 sam-text-body-secondary text-sam-muted">{t("admin_report_sanctions_intro")}</p>
        <AdminSanctionPanel
          reportId={report.id}
          targetUserId={report.targetUserId}
          targetLabel={report.targetTitle ?? report.targetId}
          onActionSuccess={refreshDetail}
        />
      </AdminCard>
      <AdminCard titleKey="admin_report_card_log">
        {actionLogs.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_report_no_logs")}</p>
        ) : (
          <ul className="space-y-2">
            {actionLogs.map((a) => {
              const mk = messageKeyForReportAction(a.actionType);
              const actionLabel = mk ? t(mk) : a.actionType;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
                >
                  <span className="font-medium text-sam-fg">{actionLabel}</span>
                  <span className="text-sam-muted">
                    {new Date(a.createdAt).toLocaleString(localeForDetail(language))}
                  </span>
                  <span className="text-sam-muted">· {a.adminNickname}</span>
                  {a.actionNote ? (
                    <span className="w-full text-sam-muted">
                      {t("admin_report_memo_with_note", { note: a.actionNote } as Record<string, string | number>)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
      {report.targetType === "chat" && report.targetId && (
        <AdminCard titleKey="admin_report_card_chat">
          <Link
            href={`/admin/chats/${report.targetId}`}
            className="sam-text-body font-medium text-signature hover:underline"
          >
            {t("admin_report_chat_open_detail")}
          </Link>
        </AdminCard>
      )}
    </div>
  );
}
