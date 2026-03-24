"use client";

import { useMemo } from "react";
import { getOpsKnowledgeSummary } from "@/lib/ops-knowledge/mock-ops-knowledge-summary";

const CATEGORY_LABELS: Record<string, string> = {
  incident_response: "인시던트",
  deployment: "배포",
  rollback: "롤백",
  recommendation: "추천",
};

export function OpsKnowledgeSummaryCards() {
  const summary = useMemo(() => getOpsKnowledgeSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">전체 / 활성 문서</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalDocuments} / {summary.activeDocuments}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">오늘 검색 / 추천 클릭</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalSearchesToday} / {summary.totalRecommendationClicks}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">최근 수정 / 인기 카테고리</p>
        <p className="text-[14px] font-medium text-gray-900">
          {summary.latestUpdatedAt
            ? new Date(summary.latestUpdatedAt).toLocaleDateString("ko-KR")
            : "-"}
          {" · "}
          {summary.topCategory ? CATEGORY_LABELS[summary.topCategory] ?? summary.topCategory : "-"}
        </p>
        {summary.topSearchedKeyword && (
          <p className="mt-1 text-[13px] text-gray-600">
            인기 검색어: {summary.topSearchedKeyword}
          </p>
        )}
      </div>
    </div>
  );
}
