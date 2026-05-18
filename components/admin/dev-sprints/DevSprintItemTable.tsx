"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getDevSprintItems } from "@/lib/dev-sprints/mock-dev-sprint-items";
import { getDevSprints, getDevSprintById } from "@/lib/dev-sprints/mock-dev-sprints";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSprintItemStatusLabel,
  getSprintItemPriorityLabel,
  getSprintItemOwnerTypeLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";
import type { DevSprintItemStatus } from "@/lib/types/dev-sprints";

export function DevSprintItemTable() {
  const { t } = useI18n();
  const [sprintId, setSprintId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<DevSprintItemStatus | "">("");

  const sprints = useMemo(() => getDevSprints(), []);
  const items = useMemo(
    () =>
      getDevSprintItems({
        ...(sprintId ? { sprintId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [sprintId, statusFilter]
  );

  const headers = useMemo(
    () =>
      [
        "admin_dev_sprint_th_title",
        "admin_dev_sprint_th_sprint",
        "admin_dev_sprint_th_status",
        "admin_dev_sprint_th_priority",
        "admin_dev_sprint_th_assignee",
        "admin_dev_sprint_th_blocker",
        "admin_dev_sprint_th_link",
      ] as MessageKey[],
    []
  );

  const statusOptions = useMemo(
    () =>
      [
        { value: "" as const, labelKey: "common_all" as const },
        { value: "todo" as const, labelKey: "admin_dev_sprint_status_todo" as const },
        { value: "in_progress" as const, labelKey: "admin_dev_sprint_status_in_progress" as const },
        { value: "review" as const, labelKey: "admin_dev_sprint_status_review" as const },
        { value: "qa_ready" as const, labelKey: "admin_dev_sprint_status_qa_ready" as const },
        { value: "done" as const, labelKey: "admin_dev_sprint_status_done" as const },
        { value: "blocked" as const, labelKey: "admin_dev_sprint_status_blocked" as const },
      ] satisfies { value: DevSprintItemStatus | ""; labelKey: MessageKey }[],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_dev_sprint_label_sprint")}</span>
        <select
          value={sprintId}
          onChange={(e) => setSprintId(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sprintName}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_dev_sprint_label_status")}</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as DevSprintItemStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_dev_sprint_empty_items")}
        </div>
      ) : (
        <AdminTable headers={headers.map((k) => t(k))}>
          {items.map((i) => {
            const sprint = getDevSprintById(i.sprintId);
            return (
              <tr
                key={i.id}
                className={`border-b border-sam-border-soft ${
                  i.status === "blocked" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">{i.title}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {sprint?.sprintName ?? i.sprintId}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 sam-text-helper ${
                      i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : i.status === "done"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {getSprintItemStatusLabel(t, i.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {getSprintItemPriorityLabel(t, i.priority)}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {getSprintItemOwnerTypeLabel(t, i.ownerType)} {i.ownerName}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-red-600">
                  {i.blockerReason ?? "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary">
                  {i.linkedQaIssueId && (
                    <Link href="/admin/qa-board" className="text-signature hover:underline">
                      QA
                    </Link>
                  )}
                  {i.linkedActionItemId && (
                    <>
                      {" "}
                      <Link href="/admin/ops-board" className="text-signature hover:underline">
                        {t("admin_dev_sprint_link_action")}
                      </Link>
                    </>
                  )}
                  {i.linkedDeploymentId && (
                    <>
                      {" "}
                      <Link
                        href="/admin/recommendation-deployments"
                        className="text-signature hover:underline"
                      >
                        {t("admin_dev_sprint_link_deploy")}
                      </Link>
                    </>
                  )}
                  {!i.linkedQaIssueId && !i.linkedActionItemId && !i.linkedDeploymentId && "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
