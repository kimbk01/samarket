"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getQaTestCases } from "@/lib/qa-board/qa-board-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCaseStatusLabel,
  getPriorityLabel,
  getEnvLabel,
} from "@/lib/qa-board/qa-board-utils";
import type {
  QaTestCaseStatus,
  QaTestEnvironment,
} from "@/lib/types/qa-board";
import Link from "next/link";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
const FILTER_EXTRAS = ["case_status", "env"] as const;

export function QaTestCaseTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const status = lq.query.extras.case_status as QaTestCaseStatus | "";
  const environment = lq.query.extras.env as QaTestEnvironment | "";
  const cases = useMemo(
    () =>
      getQaTestCases({
        ...(status ? { status: status as QaTestCaseStatus } : {}),
        ...(environment
          ? { environment: environment as QaTestEnvironment }
          : {}),
      }),
    [status, environment]
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
        <AdminFilterSelect ko={ko} label={t("admin_qa_status_2")} name="case_status" value={lq.query.extras.case_status} onChange={(v) => lq.setExtra("case_status", v)}>
          <option value="">{t("common_all")}</option>
          <option value="not_started">{t("admin_qa_not_started")}</option>
          <option value="in_progress">{t("admin_qa_in_progress")}</option>
          <option value="passed">{t("admin_qa_passed_2")}</option>
          <option value="failed">{t("admin_qa_failed")}</option>
          <option value="blocked">{t("admin_qa_blocked")}</option>
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_qa_environment")} name="env" value={lq.query.extras.env} onChange={(v) => lq.setExtra("env", v)}>
          <option value="">{t("common_all")}</option>
          <option value="local">Local</option>
          <option value="staging">Staging</option>
          <option value="production_candidate">{t("admin_production_candidate")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {cases.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_qa_board_no_test_cases")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[
            t("admin_qa_board_th_title"),
            t("admin_qa_board_th_status"),
            t("admin_qa_board_th_priority"),
            "Must-Pass",
            t("admin_qa_board_th_owner"),
            t("admin_qa_board_th_run_at"),
            t("admin_qa_board_th_env"),
            t("admin_qa_board_th_fail_reason"),
            t("admin_qa_board_th_link"),
          ]}
        >
          {cases.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.isMustPass && (c.status === "failed" || c.status === "blocked")
                  ? "bg-sam-danger-soft/30"
                  : c.status === "failed" || c.status === "blocked"
                    ? "bg-sam-warning-soft/20"
                    : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "passed"
                      ? "bg-sam-success-soft text-sam-success"
                      : c.status === "failed"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : c.status === "blocked"
                          ? "bg-sam-warning-soft text-sam-warning"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getCaseStatusLabel(t, c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(t, c.priority)}
              </td>
              <td className="px-3 py-2.5">
                {c.isMustPass ? (
                  <span className="rounded bg-sam-danger-soft px-1.5 py-0.5 sam-text-helper text-sam-danger">
                    {t("admin_qa_board_required_badge")}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.executedAt
                  ? formatAdminManilaDateTime(c.executedAt)
                  : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getEnvLabel(t, c.environment)}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.failureNote || c.blockerReason || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.linkedType && c.linkedId ? (
                  c.linkedType === "readiness_item" ? (
                    <Link
                      href="/admin/launch-readiness"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  ) : c.linkedType === "migration_table" ? (
                    <Link
                      href="/admin/production-migration"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  ) : (
                    `${c.linkedType}: ${c.linkedId}`
                  )
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
