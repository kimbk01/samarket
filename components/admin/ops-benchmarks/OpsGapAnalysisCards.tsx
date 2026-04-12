"use client";

import { useMemo, useState } from "react";
import { getHighGapDomains } from "@/lib/ops-benchmarks/ops-benchmarks-utils";
import { getOpsBenchmarks } from "@/lib/ops-benchmarks/mock-ops-benchmarks";
import type { OpsBenchmarkScope, OpsBenchmarkDomain } from "@/lib/types/ops-benchmarks";

const SCOPE_LABELS: Record<OpsBenchmarkScope, string> = {
  quarterly: "분기",
  yearly: "연간",
};

const DOMAIN_LABELS: Record<OpsBenchmarkDomain, string> = {
  recommendation_quality: "추천 품질",
  incident_response: "장애 대응",
  automation: "자동화 수준",
  documentation: "문서 최신화",
  execution: "운영 실행력",
  learning: "학습/회고 성숙도",
};

export function OpsGapAnalysisCards() {
  const [scope, setScope] = useState<OpsBenchmarkScope>("quarterly");
  const highGap = useMemo(() => getHighGapDomains(scope, 6), [scope]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">범위</span>
        {(["quarterly", "yearly"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded border px-3 py-1.5 text-[13px] ${
              scope === s
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {SCOPE_LABELS[s]}
          </button>
        ))}
      </div>

      {highGap.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          목표 대비 갭이 큰 영역이 없습니다.
        </div>
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-sam-fg">
              갭 분석 (목표 미달 영역 강조)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highGap.map(({ domain, gapScore }) => (
                <div
                  key={domain}
                  className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-4"
                >
                  <p className="text-[12px] text-sam-muted">
                    {DOMAIN_LABELS[domain]}
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-amber-800">
                    갭 +{gapScore}
                  </p>
                  <p className="mt-1 text-[12px] text-sam-muted">
                    개선 우선순위 추천
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-sam-fg">
              개선 우선순위 추천
            </h3>
            <p className="text-[13px] text-sam-muted">
              위 갭이 큰 영역 순으로 분기 계획·로드맵에 반영을 권장합니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
