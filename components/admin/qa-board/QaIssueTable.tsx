"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getQaIssueLogs } from "@/lib/qa-board/qa-board-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSeverityLabel,
  getIssueStatusLabel,
} from "@/lib/qa-board/qa-board-utils";
import { QA_TABLE_HEADER_KEYS } from "@/components/admin/i18n/admin-qa-label-keys";
import type { QaIssueStatus, QaIssueSeverity } from "@/lib/types/qa-board";
import Link from "next/link";

export function QaIssueTable() {
  const { t } = useI18n();
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
  const [status, setStatus] = useState<QaIssueStatus | "">("");
  const [severity, setSeverity] = useState<QaIssueSeverity | "">("");
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_qa_status_2")}</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as QaIssueStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="open">{t("admin_qa_open")}</option>
          <option value="in_progress">{t("admin_qa_in_progress")}</option>
          <option value="fixed">{t("admin_qa_fixed")}</option>
          <option value="verified">{t("admin_qa_verified")}</option>
          <option value="wont_fix">{t("admin_qa_wont_fix")}</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_qa_severity")}</span>
        <select
          value={severity}
          onChange={(e) =>
            setSeverity((e.target.value || "") as QaIssueSeverity | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="critical">{t("admin_qa_critical")}</option>
          <option value="high">{t("admin_qa_high")}</option>
          <option value="medium">{t("admin_qa_medium")}</option>
          <option value="low">{t("admin_qa_low")}</option>
        </select>
      </div>

      <p className="sam-text-helper text-sam-muted">
        {t("admin_qa_visible")}
      </p>

      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_qa_empty_issues")}
        </div>
      ) : (
        <AdminTable headers={headers}>
          {logs.map((l) => (
            <tr
              key={l.id}
              className={`border-b border-sam-border-soft ${
                l.severity === "critical" && !["fixed", "verified", "wont_fix"].includes(l.status)
                  ? "bg-red-50/30"
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
                      ? "bg-red-100 text-red-800"
                      : l.severity === "high"
                        ? "bg-amber-100 text-amber-800"
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
                      ? "bg-emerald-100 text-emerald-800"
                      : l.status === "open"
                        ? "bg-red-100 text-red-800"
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
