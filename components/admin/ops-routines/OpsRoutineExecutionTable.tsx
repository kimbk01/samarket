"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import {
  getOpsRoutineExecutions,
  getOpsRoutineTemplateById,
} from "@/lib/ops-routines/ops-routines-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCategoryLabel,
  getCadenceLabel,
  getExecutionStatusLabel,
  getPriorityLabel,
} from "@/lib/ops-routines/ops-routines-utils";
import type {
  OpsRoutinePeriodType,
  OpsRoutineExecutionStatus,
} from "@/lib/types/ops-routines";
import Link from "next/link";

export function OpsRoutineExecutionTable() {
  const { t } = useI18n();
  const [periodType, setPeriodType] = useState<OpsRoutinePeriodType | "">("");
  const [status, setStatus] = useState<OpsRoutineExecutionStatus | "">("");
  const executions = useMemo(
    () =>
      getOpsRoutineExecutions({
        ...(periodType ? { periodType: periodType as OpsRoutinePeriodType } : {}),
        ...(status ? { status: status as OpsRoutineExecutionStatus } : {}),
      }),
    [periodType, status]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_routines_label_period")}</span>
        <select
          value={periodType}
          onChange={(e) =>
            setPeriodType((e.target.value || "") as OpsRoutinePeriodType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="weekly">{t("admin_ops_tools_period_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_period_monthly")}</option>
          <option value="quarterly">{t("admin_ops_tools_period_quarterly")}</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_board_th_status")}</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as OpsRoutineExecutionStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="todo">{t("admin_ops_tools_routine_todo")}</option>
          <option value="in_progress">{t("admin_ops_tools_checklist_in_progress")}</option>
          <option value="done">{t("admin_ops_tools_checklist_done")}</option>
          <option value="skipped">{t("admin_ops_tools_routine_skipped")}</option>
          <option value="overdue">{t("admin_ops_tools_routine_overdue")}</option>
        </select>
      </div>

      <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_sla_hint")}</p>

      {executions.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_routines_exec_empty")}</div>
      ) : (
        <AdminTable
          headers={[
            "템플릿",
            "주기",
            "periodKey",
            "예정일",
            "기한",
            "상태",
            "우선순위",
            "담당",
            "이월",
            "연결",
            "비고",
          ]}
        >
          {executions.map((e) => {
            const t = getOpsRoutineTemplateById(e.templateId);
            return (
              <tr
                key={e.id}
                className={`border-b border-sam-border-soft ${
                  e.status === "overdue" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {t?.title ?? e.templateId}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {getCadenceLabel(e.periodType as "weekly" | "monthly" | "quarterly")}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.periodKey}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.scheduledDate}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.dueDate ?? "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 sam-text-helper ${
                      e.status === "done"
                        ? "bg-emerald-100 text-emerald-800"
                        : e.status === "overdue"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {getExecutionStatusLabel(e.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {getPriorityLabel(e.priority)}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.ownerAdminNickname ?? "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.carryOverToNextPeriod ? "Y" : "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {e.linkedType && e.linkedId ? (
                    e.linkedType === "report" ? (
                      <Link
                        href="/admin/recommendation-reports"
                        className="text-signature hover:underline"
                      >
                        {e.linkedId}
                      </Link>
                    ) : e.linkedType === "maturity" ? (
                      <Link
                        href="/admin/ops-maturity"
                        className="text-signature hover:underline"
                      >
                        maturity
                      </Link>
                    ) : e.linkedType === "benchmark" ? (
                      <Link
                        href="/admin/ops-benchmarks"
                        className="text-signature hover:underline"
                      >
                        benchmark
                      </Link>
                    ) : (
                      `${e.linkedType}: ${e.linkedId}`
                    )
                  ) : (
                    "-"
                  )}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {e.note || "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
