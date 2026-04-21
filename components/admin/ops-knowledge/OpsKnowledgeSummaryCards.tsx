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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">전체 / 활성 문서</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalDocuments} / {summary.activeDocuments}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">오늘 검색 / 추천 클릭</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalSearchesToday} / {summary.totalRecommendationClicks}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">최근 수정 / 인기 카테고리</p>
        <p className="sam-text-body font-medium text-sam-fg">
          {summary.latestUpdatedAt
            ? new Date(summary.latestUpdatedAt).toLocaleDateString("ko-KR")
            : "-"}
          {" · "}
          {summary.topCategory ? CATEGORY_LABELS[summary.topCategory] ?? summary.topCategory : "-"}
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
