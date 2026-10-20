"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
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
  const { t, language } = useI18n();
  const ko = language !== "en";
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
      <AdminEmptyState ko={ko} message={t("admin_ops_tools_runbook_steps_empty")} />
    );
  }

  return (
    <div className="space-y-4">
      {hasBlocked && (
        <div className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft p-3 sam-text-body font-medium text-sam-danger">{t("admin_ops_tools_runbook_blocked_warn")}</div>
      )}
      {pendingOrBlocked.length > 0 && executionStatus === "in_progress" && (
        <div className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft p-3 sam-text-body text-sam-warning">
          {t("admin_ops_tools_runbook_pending_steps", { count: pendingOrBlocked.length })}
        </div>
      )}
      <ul className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`rounded-ui-rect border p-4 ${
              s.status === "blocked"
                ? "border-sam-danger/30 bg-sam-danger-soft/50"
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
                        ? "bg-sam-success-soft text-sam-success"
                        : s.status === "in_progress"
                          ? "bg-sam-warning-soft text-sam-warning"
                          : s.status === "blocked"
                            ? "bg-sam-danger-soft text-sam-danger"
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
                    {s.startedAt && ` · 시작 ${formatAdminManilaDateTime(s.startedAt)}`}
                    {s.completedAt && ` · 완료 ${formatAdminManilaDateTime(s.completedAt)}`}
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
                    <AdminActionButton
                      size="sm"
                      onClick={() => handleStatus(s.id, "in_progress")}
                    >{t("admin_ops_tools_runbook_th_started")}</AdminActionButton>
                  )}
                  {s.status === "in_progress" && (
                    <AdminActionButton
                      size="sm"
                      onClick={() => handleStatus(s.id, "done")}
                    >{t("admin_ops_tools_checklist_done")}</AdminActionButton>
                  )}
                  {(s.status === "pending" || s.status === "in_progress") && (
                    <>
                      <AdminActionButton
                        size="sm"
                        onClick={() => handleStatus(s.id, "skipped")}
                      >{t("admin_ops_tools_checklist_skipped")}</AdminActionButton>
                      <AdminActionButton
                        size="sm"
                        onClick={() => handleStatus(s.id, "blocked")}
                      >{t("admin_ops_tools_checklist_blocked")}</AdminActionButton>
                    </>
                  )}
                  {s.status === "blocked" && (
                    <AdminActionButton
                      size="sm"
                      onClick={() => handleStatus(s.id, "in_progress")}
                    >{t("admin_ops_tools_runbook_btn_resume")}</AdminActionButton>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}
