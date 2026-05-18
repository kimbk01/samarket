"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DevSprintItem } from "@/lib/types/dev-sprints";
import {
  getSprintItemStatusLabel,
  getSprintItemPriorityLabel,
  getSprintItemOwnerTypeLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";

interface DevSprintItemCardProps {
  item: DevSprintItem;
}

export function DevSprintItemCard({ item }: DevSprintItemCardProps) {
  const { t } = useI18n();
  const isBlocked = item.status === "blocked";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isBlocked ? "border-red-200 bg-red-50/50" : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 sam-text-helper text-sam-muted">
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {getSprintItemPriorityLabel(t, item.priority)}
        </span>
        <span>{getSprintItemOwnerTypeLabel(t, item.ownerType)}</span>
        {item.estimatePoint != null && <span>{item.estimatePoint}pt</span>}
      </div>
      <p className="mt-2 font-medium text-sam-fg">{item.title}</p>
      {item.description && (
        <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">
          {item.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 sam-text-helper">
        <span
          className={`rounded px-1.5 py-0.5 ${
            isBlocked
              ? "bg-red-100 text-red-800"
              : item.status === "done"
                ? "bg-emerald-50 text-emerald-700"
                : item.status === "in_progress" || item.status === "review"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {getSprintItemStatusLabel(t, item.status)}
        </span>
        {item.ownerName && <span className="text-sam-muted">{item.ownerName}</span>}
      </div>
      {item.blockerReason && (
        <p className="mt-2 sam-text-helper font-medium text-red-700">
          {t("admin_dev_sprint_blocker_prefix")} {item.blockerReason}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1 sam-text-helper">
        {item.linkedQaIssueId && (
          <Link href="/admin/qa-board" className="text-signature hover:underline">
            QA
          </Link>
        )}
        {item.linkedActionItemId && (
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            {t("admin_dev_sprint_link_action")}
          </Link>
        )}
        {item.linkedDeploymentId && (
          <Link
            href="/admin/recommendation-deployments"
            className="text-signature hover:underline"
          >
            {t("admin_dev_sprint_link_deploy")}
          </Link>
        )}
      </div>
    </div>
  );
}
