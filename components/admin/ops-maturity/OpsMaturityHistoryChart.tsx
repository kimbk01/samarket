"use client";

import { useMemo } from "react";
import { getOpsMaturityHistory } from "@/lib/ops-maturity/mock-ops-maturity-history";

/** 성숙도 히스토리 추이 placeholder (표로 대체) */
export function OpsMaturityHistoryChart() {
  const history = useMemo(() => getOpsMaturityHistory(10), []);

  if (history.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        히스토리 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">일자</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">종합</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">모니터링</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">자동화</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">문서화</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">대응</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">추천</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">학습</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">{h.scoreDate}</td>
              <td className="px-3 py-2.5 text-right font-medium text-sam-fg">{h.overallScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.monitoringScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.automationScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.documentationScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.responseScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.recommendationQualityScore}</td>
              <td className="px-3 py-2.5 text-right text-sam-muted">{h.learningScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-[12px] text-sam-muted">차트 시각화는 placeholder (표 대체)</p>
    </div>
  );
}
