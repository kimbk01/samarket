"use client";

import { useMemo } from "react";
import { getRecommendationBriefingBoard } from "@/lib/recommendation-reports/mock-recommendation-briefing-board";

interface RecommendationBriefingBoardCardProps {
  reportId: string;
}

export function RecommendationBriefingBoardCard({
  reportId,
}: RecommendationBriefingBoardCardProps) {
  const board = useMemo(
    () => getRecommendationBriefingBoard(reportId),
    [reportId]
  );

  if (!board) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        브리핑 보드가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="mb-2 text-[14px] font-medium text-sam-fg">
          오늘 핵심 하이라이트
        </h3>
        <ul className="list-inside list-disc space-y-1 text-[13px] text-sam-fg">
          {board.topHighlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-4">
        <h3 className="mb-2 text-[14px] font-medium text-amber-900">
          주의/리스크
        </h3>
        <ul className="list-inside list-disc space-y-1 text-[13px] text-amber-800">
          {board.topRisks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="mb-2 text-[14px] font-medium text-sam-fg">
            주목 섹션 (상승)
          </h3>
          <p className="text-[13px] text-sam-fg">
            {board.topWinningSections.join(", ") || "-"}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="mb-2 text-[14px] font-medium text-sam-fg">
            주목 섹션 (하락)
          </h3>
          <p className="text-[13px] text-sam-fg">
            {board.topDroppedSections.join(", ") || "-"}
          </p>
        </div>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <h3 className="mb-2 text-[14px] font-medium text-sam-fg">
          배포 / 롤백 / 자동화 요약
        </h3>
        <p className="mb-2 text-[13px] text-sam-fg">
          {board.deploymentSummary}
        </p>
        <p className="mb-2 text-[13px] text-sam-fg">
          {board.rollbackSummary}
        </p>
        <p className="text-[13px] text-sam-fg">
          {board.automationSummary}
        </p>
      </div>
    </div>
  );
}
