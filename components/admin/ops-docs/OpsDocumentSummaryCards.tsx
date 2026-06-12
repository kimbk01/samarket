"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsDocumentSummary } from "@/lib/ops-docs/ops-docs-summary";
import { adminDateLocaleTag } from "@/components/admin/i18n/admin-date-locale";

export function OpsDocumentSummaryCards() {
  const { t, language } = useI18n();
  const dateLocale = adminDateLocaleTag(language);
  const summary = useMemo(() => getOpsDocumentSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_doc_summary_total")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalDocuments}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_doc_summary_statuses")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalActive} / {summary.totalDraft} / {summary.totalArchived}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_doc_summary_pinned")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalPinned}
        </p>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_ops_doc_summary_latest", {
            at: summary.latestUpdatedAt
              ? new Date(summary.latestUpdatedAt).toLocaleString(dateLocale)
              : "-",
          })}
        </p>
      </div>
    </div>
  );
}
