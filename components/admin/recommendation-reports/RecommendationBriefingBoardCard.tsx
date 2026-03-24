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
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        브리핑 보드가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-[14px] font-medium text-gray-900">
          오늘 핵심 하이라이트
        </h3>
        <ul className="list-inside list-disc space-y-1 text-[13px] text-gray-700">
          {board.topHighlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
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
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-[14px] font-medium text-gray-900">
            주목 섹션 (상승)
          </h3>
          <p className="text-[13px] text-gray-700">
            {board.topWinningSections.join(", ") || "-"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-[14px] font-medium text-gray-900">
            주목 섹션 (하락)
          </h3>
          <p className="text-[13px] text-gray-700">
            {board.topDroppedSections.join(", ") || "-"}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-[14px] font-medium text-gray-900">
          배포 / 롤백 / 자동화 요약
        </h3>
        <p className="mb-2 text-[13px] text-gray-700">
          {board.deploymentSummary}
        </p>
        <p className="mb-2 text-[13px] text-gray-700">
          {board.rollbackSummary}
        </p>
        <p className="text-[13px] text-gray-700">
          {board.automationSummary}
        </p>
      </div>
    </div>
  );
}
