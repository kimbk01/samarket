"use client";

import { useMemo } from "react";
import { getOpsMaturityHistory } from "@/lib/ops-maturity/mock-ops-maturity-history";

/** 성숙도 히스토리 추이 placeholder (표로 대체) */
export function OpsMaturityHistoryChart() {
  const history = useMemo(() => getOpsMaturityHistory(10), []);

  if (history.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        히스토리 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[480px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">일자</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">종합</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">모니터링</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">자동화</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">문서화</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">대응</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">추천</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">학습</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5 text-gray-700">{h.scoreDate}</td>
              <td className="px-3 py-2.5 text-right font-medium text-gray-900">{h.overallScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.monitoringScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.automationScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.documentationScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.responseScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.recommendationQualityScore}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{h.learningScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-[12px] text-gray-500">차트 시각화는 placeholder (표 대체)</p>
    </div>
  );
}
