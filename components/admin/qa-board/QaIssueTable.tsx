"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getQaIssueLogs } from "@/lib/qa-board/qa-board-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSeverityLabel,
  getIssueStatusLabel,
} from "@/lib/qa-board/qa-board-utils";
import { QA_TABLE_HEADER_KEYS } from "@/components/admin/i18n/admin-qa-label-keys";
import type { QaIssueStatus, QaIssueSeverity } from "@/lib/types/qa-board";
import Link from "next/link";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["severity"] as const;

export function QaIssueTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const headers = useMemo(
    () =>
      [
        QA_TABLE_HEADER_KEYS.title,
        QA_TABLE_HEADER_KEYS.severity,
        QA_TABLE_HEADER_KEYS.status,
        QA_TABLE_HEADER_KEYS.linkedTest,
        QA_TABLE_HEADER_KEYS.reproduce,
        QA_TABLE_HEADER_KEYS.owner,
        QA_TABLE_HEADER_KEYS.notes,
      ].map((k) => t(k)),
    [t]
  );
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const status = lq.query.status as QaIssueStatus | "";
  const severity = lq.query.extras.severity as QaIssueSeverity | "";
  const logs = useMemo(
    () =>
      getQaIssueLogs({
        ...(status ? { status: status as QaIssueStatus } : {}),
        ...(severity ? { severity: severity as QaIssueSeverity } : {}),
      }),
    [status, severity]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_qa_status_2")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("common_all")}</option>
          <option value="open">{t("admin_qa_open")}</option>
          <option value="in_progress">{t("admin_qa_in_progress")}</option>
          <option value="fixed">{t("admin_qa_fixed")}</option>
          <option value="verified">{t("admin_qa_verified")}</option>
          <option value="wont_fix">{t("admin_qa_wont_fix")}</option>
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_qa_severity")} name="severity" value={lq.query.extras.severity} onChange={(v) => lq.setExtra("severity", v)}>
          <option value="">{t("common_all")}</option>
          <option value="critical">{t("admin_qa_critical")}</option>
          <option value="high">{t("admin_qa_high")}</option>
          <option value="medium">{t("admin_qa_medium")}</option>
          <option value="low">{t("admin_qa_low")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">
        {t("admin_qa_visible")}
      </p>

      {logs.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_qa_empty_issues")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable headers={headers}>
          {logs.map((l) => (
            <tr
              key={l.id}
              className={`border-b border-sam-border-soft ${
                l.severity === "critical" && !["fixed", "verified", "wont_fix"].includes(l.status)
                  ? "bg-sam-danger-soft/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {l.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    l.severity === "critical"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : l.severity === "high"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getSeverityLabel(t, l.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    l.status === "verified"
                      ? "bg-sam-success-soft text-sam-success"
                      : l.status === "open"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getIssueStatusLabel(t, l.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {l.relatedTestCaseId ? (
                  <Link
                    href="/admin/qa-board"
                    className="text-signature hover:underline"
                  >
                    {l.relatedTestCaseId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {l.reproduced === true ? "Y" : l.reproduced === false ? "N" : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {l.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {l.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
