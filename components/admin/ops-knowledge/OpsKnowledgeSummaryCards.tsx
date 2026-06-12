"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_CHECKLIST_CATEGORY_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import { getOpsKnowledgeSummary } from "@/lib/ops-knowledge/ops-knowledge-summary";

export function OpsKnowledgeSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getOpsKnowledgeSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kb_summary_docs")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalDocuments} / {summary.activeDocuments}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kb_summary_search")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalSearchesToday} / {summary.totalRecommendationClicks}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kb_summary_recent")}</p>
        <p className="sam-text-body font-medium text-sam-fg">
          {summary.latestUpdatedAt
            ? new Date(summary.latestUpdatedAt).toLocaleDateString("ko-KR")
            : "-"}
          {" · "}
          {summary.topCategory ? t(opsToolsLabel(OPS_TOOLS_CHECKLIST_CATEGORY_KEYS, summary.topCategory)) ?? summary.topCategory : "-"}
        </p>
        {summary.topSearchedKeyword && (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            인기 검색어: {summary.topSearchedKeyword}
          </p>
        )}
      </div>
    </div>
  );
}
