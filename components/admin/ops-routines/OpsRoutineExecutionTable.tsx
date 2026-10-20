"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsRoutineTemplateById } from "@/lib/ops-routines/ops-routines-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCategoryLabel,
  getCadenceLabel,
  getExecutionStatusLabel,
  getPriorityLabel,
} from "@/lib/ops-routines/ops-routines-utils";
import type { OpsRoutineExecution } from "@/lib/types/ops-routines";
import Link from "next/link";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

/** 같은 탭의 템플릿 표(category·cadence)와 키가 겹치지 않게 상태는 `exec_status`. */
const FILTER_EXTRAS = ["period", "exec_status"] as const;

export function OpsRoutineExecutionTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  /** 실행 이력 = 서버 페이지 (`GET /api/admin/ops-routines?part=executions`, R7) — 전체를 한 번에 그리지 않는다. */
  const page = useAdminServerPage<OpsRoutineExecution>(
    `/api/admin/ops-routines?part=executions&${lq.apiQueryString}`,
    lq.refreshKey
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
        <AdminFilterSelect ko={ko} label={t("admin_ops_tools_routines_label_period")} name="period" value={lq.query.extras.period} onChange={(v) => lq.setExtra("period", v)}>
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="weekly">{t("admin_ops_tools_period_weekly")}</option>
          <option value="monthly">{t("admin_ops_tools_period_monthly")}</option>
          <option value="quarterly">{t("admin_ops_tools_period_quarterly")}</option>
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_ops_tools_board_th_status")} name="exec_status" value={lq.query.extras.exec_status} onChange={(v) => lq.setExtra("exec_status", v)}>
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          <option value="todo">{t("admin_ops_tools_routine_todo")}</option>
          <option value="in_progress">{t("admin_ops_tools_checklist_in_progress")}</option>
          <option value="done">{t("admin_ops_tools_checklist_done")}</option>
          <option value="skipped">{t("admin_ops_tools_routine_skipped")}</option>
          <option value="overdue">{t("admin_ops_tools_routine_overdue")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_sla_hint")}</p>

      <AdminServerListFrame
        ko={ko}
        state={page}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        onRetry={lq.refresh}
        onReset={lq.isFiltered ? lq.reset : undefined}
        emptyMessage={t("admin_ops_tools_routines_exec_empty")}
      >
        {(executions) => (
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
                  e.status === "overdue" ? "bg-sam-danger-soft/30" : ""
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
                        ? "bg-sam-success-soft text-sam-success"
                        : e.status === "overdue"
                          ? "bg-sam-danger-soft text-sam-danger"
                          : "bg-sam-warning-soft text-sam-warning"
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
      </AdminServerListFrame>
    </div>
  );
}
