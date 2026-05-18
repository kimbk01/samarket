"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationBriefingBoard } from "@/lib/recommendation-reports/mock-recommendation-briefing-board";

interface RecommendationBriefingBoardCardProps {
  reportId: string;
}

export function RecommendationBriefingBoardCard({
  reportId,
}: RecommendationBriefingBoardCardProps) {
  const { t } = useI18n();
  const board = useMemo(
    () => getRecommendationBriefingBoard(reportId),
    [reportId]
  );

  if (!board) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_rec_report_empty_briefing")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
          {t("admin_rec_report_briefing_highlights")}
        </h3>
        <ul className="list-inside list-disc space-y-1 sam-text-body-secondary text-sam-fg">
          {board.topHighlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-4">
        <h3 className="mb-2 sam-text-body font-medium text-amber-900">
          {t("admin_rec_report_briefing_risks")}
        </h3>
        <ul className="list-inside list-disc space-y-1 sam-text-body-secondary text-amber-800">
          {board.topRisks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            {t("admin_rec_report_briefing_sections_up")}
          </h3>
          <p className="sam-text-body-secondary text-sam-fg">
            {board.topWinningSections.join(", ") || "-"}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
            {t("admin_rec_report_briefing_sections_down")}
          </h3>
          <p className="sam-text-body-secondary text-sam-fg">
            {board.topDroppedSections.join(", ") || "-"}
          </p>
        </div>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <h3 className="mb-2 sam-text-body font-medium text-sam-fg">
          {t("admin_rec_report_briefing_deploy_summary")}
        </h3>
        <p className="mb-2 sam-text-body-secondary text-sam-fg">
          {board.deploymentSummary}
        </p>
        <p className="mb-2 sam-text-body-secondary text-sam-fg">
          {board.rollbackSummary}
        </p>
        <p className="sam-text-body-secondary text-sam-fg">
          {board.automationSummary}
        </p>
      </div>
    </div>
  );
}
