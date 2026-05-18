"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getDevSprintSummary } from "@/lib/dev-sprints/mock-dev-sprint-summary";

export function DevSprintSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getDevSprintSummary(), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_dev_sprint_summary_sprint_active")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.totalSprints} / {summary.activeSprints}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_dev_sprint_summary_tasks")}</p>
          <p className="sam-text-body text-sam-fg">
            {summary.totalItems} / {summary.completedItems} /{" "}
            <span className={summary.blockedItems > 0 ? "font-medium text-red-600" : ""}>
              {summary.blockedItems}
            </span>
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_dev_sprint_summary_velocity")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.averageVelocity}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_dev_sprint_summary_latest_release")}</p>
          <p className="sam-text-body font-medium text-sam-fg">
            {summary.latestReleaseVersion ?? "-"}
          </p>
        </div>
      </div>
      {summary.blockedItems > 0 && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50/50 p-3 sam-text-body-secondary text-red-800">
          {t("admin_dev_sprint_blocked_banner", { count: summary.blockedItems })}
        </div>
      )}
      <p className="sam-text-helper text-sam-muted">
        <Link href="/admin/product-backlog" className="text-signature hover:underline">
          {t("admin_dev_sprint_link_backlog")}
        </Link>
        {" · "}
        <Link href="/admin/qa-board" className="text-signature hover:underline">
          {t("admin_dev_sprint_link_qa_board")}
        </Link>
        {" · "}
        <Link href="/admin/release-notes" className="text-signature hover:underline">
          {t("admin_dev_sprint_link_release_notes")}
        </Link>
      </p>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_dev_sprint_last_updated", {
          at: new Date(summary.latestUpdatedAt).toLocaleString(),
        })}
      </p>
    </div>
  );
}
