"use client";

import { useMemo, useState } from "react";
import { getOpsTeamKpis } from "@/lib/ops-maturity/mock-ops-team-kpis";
import { getKpiComparison } from "@/lib/ops-maturity/ops-maturity-utils";
import type { OpsKpiPeriodType } from "@/lib/types/ops-maturity";

const KPI_LABELS: Record<string, string> = {
  incidentAvgResolutionMinutes: "이슈 평균 해결(분)",
  fallbackRate: "Fallback 발생률",
  rollbackSuccessRate: "롤백 성공률",
  documentFreshnessRate: "문서 최신화율",
  checklistCompletionRate: "체크리스트 완료율",
  actionCompletionRate: "액션 완료율",
  ctrChangeRate: "CTR 변화율",
  conversionRateChange: "전환율 변화",
};

function deltaBadge(current: number, previous: number, lowerIsBetter = false): React.ReactNode {
  const delta = current - previous;
  if (delta === 0) return <span className="text-gray-500">-</span>;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className={good ? "text-emerald-600" : "text-red-600"}>
      {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
    </span>
  );
}

export function OpsTeamKpiTable() {
  const [periodType, setPeriodType] = useState<OpsKpiPeriodType>("weekly");

  const kpis = useMemo(
    () => getOpsTeamKpis({ periodType }),
    [periodType]
  );
  const { current: currKpi, previous: prevKpi } = useMemo(
    () => getKpiComparison(periodType),
    [periodType]
  );

  const rows = useMemo(() => {
    const keys = [
      "incidentAvgResolutionMinutes",
      "fallbackRate",
      "rollbackSuccessRate",
      "documentFreshnessRate",
      "checklistCompletionRate",
      "actionCompletionRate",
      "ctrChangeRate",
      "conversionRateChange",
    ] as const;
    return keys.map((key) => {
      const curr = currKpi?.[key] ?? 0;
      const prev = prevKpi?.[key] ?? 0;
      const lowerIsBetter = key === "incidentAvgResolutionMinutes" || key === "fallbackRate";
      const isRate = key.includes("Rate") || key.includes("Change");
      const fmt = (v: number) =>
        key === "incidentAvgResolutionMinutes" ? `${v}분` : isRate ? `${(v * 100).toFixed(2)}%` : v.toFixed(2);
      return { key, label: KPI_LABELS[key], current: curr, previous: prev, fmt, lowerIsBetter };
    });
  }, [currKpi, prevKpi]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as OpsKpiPeriodType)}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="weekly">주간 (이번 주 vs 지난 주)</option>
          <option value="monthly">월간 (이번 달 vs 지난 달)</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">지표</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-700">현재</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-700">이전</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-700">증감</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, current, previous, fmt, lowerIsBetter }) => (
              <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium text-gray-900">{label}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{fmt(current)}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{fmt(previous)}</td>
                <td className="px-3 py-2.5 text-right">
                  {key === "incidentAvgResolutionMinutes"
                    ? (current - previous < 0 ? (
                        <span className="text-emerald-600">개선</span>
                      ) : (
                        <span className="text-red-600">악화</span>
                      ))
                    : deltaBadge(current, previous, lowerIsBetter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
