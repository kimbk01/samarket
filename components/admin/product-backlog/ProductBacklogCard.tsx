"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProductBacklogItem } from "@/lib/types/product-backlog";
import {
  getBacklogStatusLabel,
  getPriorityLabel,
  getCategoryLabel,
  getOwnerTypeLabel,
} from "@/lib/product-backlog/product-backlog-utils";

interface ProductBacklogCardProps {
  item: ProductBacklogItem;
}

export function ProductBacklogCard({ item }: ProductBacklogCardProps) {
  const { t } = useI18n();
  const impactEffort =
    item.impactScore != null && item.effortScore != null
      ? `I${item.impactScore}/E${item.effortScore}`
      : null;

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5 sam-text-helper text-sam-muted">
        <span>{getCategoryLabel(t, item.category)}</span>
        <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
          {getPriorityLabel(t, item.priority)}
        </span>
        <span>{getOwnerTypeLabel(t, item.ownerType)}</span>
        {impactEffort && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
            {impactEffort}
          </span>
        )}
      </div>
      <p className="mt-2 font-medium text-sam-fg">{item.title}</p>
      {item.description && (
        <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">
          {item.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
        <span
          className={`rounded px-1.5 py-0.5 ${
            item.status === "released"
              ? "bg-emerald-50 text-emerald-700"
              : item.status === "in_progress"
                ? "bg-blue-50 text-blue-700"
                : item.status === "inbox"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {getBacklogStatusLabel(t, item.status)}
        </span>
        {item.releaseVersion && <span>v{item.releaseVersion}</span>}
        {item.ownerAdminNickname && (
          <span>
            {t("admin_product_backlog_owner_assignee", { name: item.ownerAdminNickname })}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 sam-text-helper">
        {item.linkedActionItemId && (
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            {t("admin_product_backlog_link_action_short")}
          </Link>
        )}
        {item.linkedQaIssueId && (
          <Link href="/admin/qa-board" className="text-signature hover:underline">
            {t("admin_product_backlog_link_qa_short")}
          </Link>
        )}
        {item.linkedReportId && (
          <Link href="/admin/reports" className="text-signature hover:underline">
            {t("admin_product_backlog_link_report_short")}
          </Link>
        )}
      </div>
      {item.handoffNote && (
        <p className="mt-2 border-t border-sam-border-soft pt-2 sam-text-helper text-sam-muted">
          {item.handoffNote}
        </p>
      )}
    </div>
  );
}
