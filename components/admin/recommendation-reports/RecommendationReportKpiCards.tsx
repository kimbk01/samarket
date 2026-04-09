"use client";

import { useMemo } from "react";
import { getRecommendationReportKpis } from "@/lib/recommendation-reports/mock-recommendation-report-kpis";

interface RecommendationReportKpiCardsProps {
  reportId: string;
}

export function RecommendationReportKpiCards({ reportId }: RecommendationReportKpiCardsProps) {
  const kpis = useMemo(
    () => getRecommendationReportKpis(reportId),
    [reportId]
  );

  if (!kpis) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        KPI 데이터가 없습니다.
      </div>
    );
  }

  const items = [
    { label: "총 노출수", value: kpis.impressionCount.toLocaleString() },
    { label: "총 클릭수", value: kpis.clickCount.toLocaleString() },
    { label: "CTR", value: `${(kpis.ctr * 100).toFixed(2)}%` },
    { label: "총 전환수", value: kpis.conversionCount.toLocaleString() },
    { label: "전환율", value: `${(kpis.conversionRate * 100).toFixed(2)}%` },
    { label: "평균 노출 점수", value: kpis.avgScore.toFixed(2) },
    { label: "Fallback 발생", value: kpis.fallbackCount },
    { label: "킬스위치 발생", value: kpis.killSwitchCount },
    { label: "자동 롤백 발생", value: kpis.rollbackCount },
    { label: "이슈 건수", value: kpis.incidentCount },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-ui-rect border border-gray-200 bg-white p-4"
        >
          <p className="text-[12px] text-gray-500">{item.label}</p>
          <p className="text-[18px] font-semibold text-gray-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
