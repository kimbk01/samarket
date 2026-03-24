"use client";

import { useMemo, useState } from "react";
import { getLatestOpsMaturityScore } from "@/lib/ops-maturity/mock-ops-maturity-scores";
import { getMaturityScoreComparison } from "@/lib/ops-maturity/ops-maturity-utils";

const DOMAIN_LABELS: Record<string, string> = {
  monitoringScore: "모니터링",
  automationScore: "자동화",
  documentationScore: "문서화",
  responseScore: "대응속도",
  recommendationQualityScore: "추천 품질",
  learningScore: "학습/회고",
};

const domainKeys = [
  "monitoringScore",
  "automationScore",
  "documentationScore",
  "responseScore",
  "recommendationQualityScore",
  "learningScore",
] as const;

export function OpsMaturityScoreCards() {
  const [scope, setScope] = useState<"weekly" | "monthly">("weekly");
  const [targetScore, setTargetScore] = useState(75);

  const latest = useMemo(
    () => getLatestOpsMaturityScore(scope),
    [scope]
  );
  const comparison = useMemo(
    () => getMaturityScoreComparison(scope),
    [scope]
  );

  if (!latest) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        성숙도 점수 데이터가 없습니다.
      </div>
    );
  }

  const gap = targetScore - latest.overallScore;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "weekly" | "monthly")}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="weekly">주간</option>
          <option value="monthly">월간</option>
        </select>
        <label className="flex items-center gap-2 text-[14px] text-gray-700">
          목표 점수
          <input
            type="number"
            min={0}
            max={100}
            value={targetScore}
            onChange={(e) => setTargetScore(Number(e.target.value))}
            className="w-16 rounded border border-gray-200 px-2 py-1 text-[14px]"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">종합 점수</p>
          <p className="text-[24px] font-semibold text-gray-900">{latest.overallScore}</p>
          {comparison && (
            <p className={`text-[13px] ${comparison.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              전 기간 대비 {comparison.delta >= 0 ? "+" : ""}{comparison.delta}
            </p>
          )}
          {gap > 0 && (
            <p className="mt-1 text-[12px] text-amber-600">목표 대비 {gap}pt 부족</p>
          )}
        </div>
        {domainKeys.map((key) => (
          <div key={key} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-[12px] text-gray-500">{DOMAIN_LABELS[key] ?? key}</p>
            <p className="text-[20px] font-semibold text-gray-900">
              {latest[key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
