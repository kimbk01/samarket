"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getProductBacklogSummary } from "@/lib/product-backlog/product-backlog-summary";
import { getProductBacklogItems } from "@/lib/product-backlog/product-backlog-state";
import {
  getCategoryLabel,
  productBacklogDateLocale,
} from "@/lib/product-backlog/product-backlog-utils";
import type { ProductFeedbackCategory } from "@/lib/types/product-backlog";

export function ProductBacklogSummaryCards() {
  const { t, language } = useI18n();
  const summary = useMemo(() => getProductBacklogSummary(), []);
  const recommendedCount = useMemo(
    () =>
      getProductBacklogItems().filter(
        (i) =>
          i.impactScore >= 7 &&
          i.effortScore <= 4 &&
          !["released", "rejected", "archived"].includes(i.status)
      ).length,
    []
  );

  const lastUpdated = useMemo(
    () =>
      t("admin_product_backlog_summary_last_updated", {
        at: new Date(summary.latestUpdatedAt).toLocaleString(productBacklogDateLocale(language)),
      }),
    [t, language, summary.latestUpdatedAt]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">
            {t("admin_product_backlog_summary_feedback_backlog")}
          </p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.totalFeedbackItems} / {summary.totalBacklogItems}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">
            {t("admin_product_backlog_summary_pipeline")}
          </p>
          <p className="sam-text-body text-sam-fg">
            {summary.inboxCount} / {summary.plannedCount} /{" "}
            {summary.inProgressCount} / {summary.releasedCount}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">
            {t("admin_product_backlog_summary_top_category")}
          </p>
          <p className="sam-text-body font-medium text-sam-fg">
            {summary.topCategory
              ? getCategoryLabel(t, summary.topCategory as ProductFeedbackCategory)
              : "-"}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">
            {t("admin_product_backlog_summary_recommended")}
          </p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {t("admin_product_backlog_summary_recommended_count", { count: recommendedCount })}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">
            {t("admin_product_backlog_summary_links")}
          </p>
          <p className="sam-text-body-secondary text-sam-fg">
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              {t("admin_product_backlog_link_action_item")}
            </Link>
            {" · "}
            <Link
              href="/admin/recommendation-reports"
              className="text-signature hover:underline"
            >
              {t("admin_product_backlog_link_report")}
            </Link>
            {" · "}
            <Link href="/admin/qa-board" className="text-signature hover:underline">
              {t("admin_product_backlog_link_qa_board")}
            </Link>
          </p>
        </div>
      </div>
      <p className="sam-text-helper text-sam-muted">{lastUpdated}</p>
    </div>
  );
}
