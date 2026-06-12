"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { OpsRunbookStepStatus } from "@/lib/types/ops-runbook";
import { getOpsRunbookExecutionSteps } from "@/lib/ops-runbooks/ops-runbooks-state";
import { updateOpsRunbookExecutionStep } from "@/lib/ops-runbooks/ops-runbooks-state";
import { setRunbookStepStatus } from "@/lib/ops-runbooks/ops-runbook-utils";
import type { OpsRunbookStepLinkedType } from "@/lib/types/ops-runbook";
import {
  OPS_TOOLS_RUNBOOK_STEP_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

const LINKED_HREF: Record<OpsRunbookStepLinkedType, (id: string) => string> = {
  incident: (id) => `/admin/recommendation-monitoring`,
  deployment: (id) => `/admin/recommendation-deployments`,
  report: (id) => `/admin/recommendation-reports/${id}`,
  checklist: () => `/admin/ops-board`,
  action_item: () => `/admin/ops-board`,
};

interface OpsRunbookStepWorkflowProps {
  executionId: string;
  executionStatus: string;
  onStepUpdate?: () => void;
}

const ADMIN_ID = "admin1";

export function OpsRunbookStepWorkflow({
  executionId,
  executionStatus,
  onStepUpdate,
}: OpsRunbookStepWorkflowProps) {
  const { t } = useI18n();
  const adminNickname = t("admin_ops_tools_admin_nickname");
  const [refresh, setRefresh] = useState(0);
  const steps = useMemo(
    () => getOpsRunbookExecutionSteps(executionId),
    [executionId, refresh]
  );

  const handleStatus = (
    stepId: string,
    status: "in_progress" | "done" | "skipped" | "blocked",
    note?: string
  ) => {
    setRunbookStepStatus(stepId, status, ADMIN_ID, adminNickname, note);
    setRefresh((r) => r + 1);
    onStepUpdate?.();
  };

  const pendingOrBlocked = steps.filter(
    (s) => s.status === "pending" || s.status === "blocked"
  );
  const hasBlocked = steps.some((s) => s.status === "blocked");

  if (steps.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_runbook_steps_empty")}</div>
    );
  }

  return (
    <div className="space-y-4">
      {hasBlocked && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 sam-text-body font-medium text-red-800">{t("admin_ops_tools_runbook_blocked_warn")}</div>
      )}
      {pendingOrBlocked.length > 0 && executionStatus === "in_progress" && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-3 sam-text-body text-amber-800">
          {t("admin_ops_tools_runbook_pending_steps", { count: pendingOrBlocked.length })}
        </div>
      )}
      <ul className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`rounded-ui-rect border p-4 ${
              s.status === "blocked"
                ? "border-red-200 bg-red-50/50"
                : "border-sam-border bg-sam-surface"
            }`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted sam-text-body font-medium text-sam-fg">
                {s.stepOrder}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sam-fg">{s.title}</span>
                  <span
                    className={`rounded px-2 py-0.5 sam-text-helper ${
                      s.status === "done"
                        ? "bg-emerald-50 text-emerald-800"
                        : s.status === "in_progress"
                          ? "bg-amber-50 text-amber-800"
                          : s.status === "blocked"
                            ? "bg-red-100 text-red-800"
                            : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_STEP_STATUS_KEYS, s.status))}
                  </span>
                </div>
                <p className="mt-1 sam-text-body-secondary text-sam-muted">{s.description}</p>
                {(s.assignedAdminNickname || s.startedAt || s.completedAt) && (
                  <p className="mt-2 sam-text-helper text-sam-muted">
                    {s.assignedAdminNickname && `담당 ${s.assignedAdminNickname}`}
                    {s.startedAt && ` · 시작 ${new Date(s.startedAt).toLocaleString("ko-KR")}`}
                    {s.completedAt && ` · 완료 ${new Date(s.completedAt).toLocaleString("ko-KR")}`}
                  </p>
                )}
                {s.note && (
                  <p className="mt-1 sam-text-body-secondary text-sam-fg">
                    {t("admin_ops_tools_runbook_step_note", { note: s.note })}
                  </p>
                )}
                {s.linkedType && (
                  <p className="mt-2 sam-text-helper">
                    <Link
                      href={s.linkedId ? LINKED_HREF[s.linkedType](s.linkedId) : "#"}
                      className="text-signature hover:underline"
                    >
                      연결 리소스 열기 {s.linkedId ? `· ${s.linkedId}` : ""}
                    </Link>
                  </p>
                )}
              </div>
            </div>
            {executionStatus === "in_progress" &&
              (s.status === "pending" || s.status === "in_progress" || s.status === "blocked") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "in_progress")}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 sam-text-helper text-amber-800"
                    >{t("admin_ops_tools_runbook_th_started")}</button>
                  )}
                  {s.status === "in_progress" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "done")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 sam-text-helper text-emerald-800"
                    >{t("admin_ops_tools_checklist_done")}</button>
                  )}
                  {(s.status === "pending" || s.status === "in_progress") && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatus(s.id, "skipped")}
                        className="rounded border border-sam-border bg-sam-surface-muted px-2 py-1 sam-text-helper text-sam-muted"
                      >{t("admin_ops_tools_checklist_skipped")}</button>
                      <button
                        type="button"
                        onClick={() => handleStatus(s.id, "blocked")}
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 sam-text-helper text-red-800"
                      >{t("admin_ops_tools_checklist_blocked")}</button>
                    </>
                  )}
                  {s.status === "blocked" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "in_progress")}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 sam-text-helper text-amber-800"
                    >{t("admin_ops_tools_runbook_btn_resume")}</button>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}
