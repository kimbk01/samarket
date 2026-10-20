"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getDevSprintItems,
  getDevSprints,
  getDevSprintById,
} from "@/lib/dev-sprints/dev-sprints-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSprintItemStatusLabel,
  getSprintItemPriorityLabel,
  getSprintItemOwnerTypeLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";
import type { DevSprintItemStatus } from "@/lib/types/dev-sprints";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const ITEM_STATUSES = ["todo", "in_progress", "review", "qa_ready", "done", "blocked"] as const;
const ITEM_EXTRAS = ["sprint"] as const;

export function DevSprintItemTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 스프린트·상태 필터는 주소(`?sprint=`·`?status=`)에 보존 (R7). */
  const lq = useAdminListQuery({ statuses: ITEM_STATUSES, extras: ITEM_EXTRAS });
  const sprintId = lq.query.extras.sprint;
  const statusFilter = lq.query.status as DevSprintItemStatus | "";

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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        status={{
          label: t("admin_dev_sprint_label_status"),
          value: lq.query.status,
          onChange: lq.setStatus,
          options: statusOptions.map((o) => ({ value: o.value, label: t(o.labelKey) })),
        }}
      >
        <AdminFilterSelect
          ko={ko}
          label={t("admin_dev_sprint_label_sprint")}
          name="sprint"
          value={sprintId}
          onChange={(v) => lq.setExtra("sprint", v)}
          allLabel={t("common_all")}
          options={sprints.map((s) => ({ value: s.id, label: s.sprintName }))}
        />
      </AdminFilterBar>

      {items.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_dev_sprint_empty_items")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable headers={headers.map((k) => t(k))}>
          {items.map((i) => {
            const sprint = getDevSprintById(i.sprintId);
            return (
              <tr
                key={i.id}
                className={`border-b border-sam-border-soft ${
                  i.status === "blocked" ? "bg-sam-danger-soft" : ""
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
                        ? "bg-sam-danger-soft text-sam-danger"
                        : i.status === "done"
                          ? "bg-sam-success-soft text-sam-success"
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
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-danger">
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
