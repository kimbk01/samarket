"use client";

import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";

interface RecommendationSummaryCardsProps {
  summaries: RecommendationAnalyticsSummary[];
}

export function RecommendationSummaryCards({
  summaries,
}: RecommendationSummaryCardsProps) {
  const bySurface = new Map<string, RecommendationAnalyticsSummary[]>();
  for (const s of summaries) {
    if (!bySurface.has(s.surface)) bySurface.set(s.surface, []);
    bySurface.get(s.surface)!.push(s);
  }

  const surfaceLabels: Record<string, string> = {
    home: "홈",
    search: "검색",
    shop: "상점",
  };

  const totalImpressions = summaries.reduce((a, s) => a + s.impressionCount, 0);
  const totalClicks = summaries.reduce((a, s) => a + s.clickCount, 0);
  const totalConversions = summaries.reduce((a, s) => a + s.conversionCount, 0);
  const overallCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const overallCvr = totalClicks > 0 ? totalConversions / totalClicks : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">총 노출</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">{totalImpressions}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">총 클릭</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">{totalClicks}</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">CTR</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {(overallCtr * 100).toFixed(2)}%
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">전환률</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {(overallCvr * 100).toFixed(2)}%
        </p>
      </div>
      {[...bySurface.entries()].map(([surface, list]) => (
        <div
          key={surface}
          className="rounded-ui-rect border border-sam-border bg-sam-app p-4 sm:col-span-2"
        >
          <p className="sam-text-body font-medium text-sam-fg">
            {surfaceLabels[surface] ?? surface} · 섹션별 성과
          </p>
          <ul className="mt-2 space-y-1 sam-text-body-secondary text-sam-fg">
            {list.slice(0, 5).map((s) => (
              <li key={s.id}>
                {s.sectionKey}: 노출 {s.impressionCount} / 클릭 {s.clickCount} (CTR {(s.ctr * 100).toFixed(1)}%) · 대표 사유: {s.topReason}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
