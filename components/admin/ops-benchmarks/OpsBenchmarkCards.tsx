"use client";

import { useMemo, useState } from "react";
import { getLatestOpsBenchmarks } from "@/lib/ops-benchmarks/mock-ops-benchmarks";
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

const TREND_LABELS: Record<string, string> = {
  improving: "상승",
  stable: "유지",
  declining: "하락",
};

export function OpsBenchmarkCards() {
  const [scope, setScope] = useState<OpsBenchmarkScope>("quarterly");
  const benchmarks = useMemo(
    () => getLatestOpsBenchmarks(scope),
    [scope]
  );

  if (benchmarks.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
        해당 기간 벤치마크 데이터가 없습니다.
      </div>
    );
  }

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {benchmarks.map((b) => (
          <div
            key={b.id}
            className={`rounded-ui-rect border p-4 ${
              b.gapScore > 5
                ? "border-amber-200 bg-amber-50/50"
                : b.gapScore <= 0
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-sam-border bg-sam-surface"
            }`}
          >
            <p className="text-[12px] text-sam-muted">
              {DOMAIN_LABELS[b.domain]}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2 text-[14px]">
              <span className="font-medium text-sam-fg">
                현재 {b.currentScore}
              </span>
              <span className="text-sam-meta">/</span>
              <span className="text-sam-muted">목표 {b.targetScore}</span>
              <span className="text-sam-meta">/</span>
              <span className="text-sam-muted">기준 {b.referenceScore}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`text-[12px] ${
                  b.gapScore > 5
                    ? "text-amber-700"
                    : b.gapScore <= 0
                      ? "text-emerald-700"
                      : "text-sam-muted"
                }`}
              >
                갭 {b.gapScore > 0 ? `+${b.gapScore}` : b.gapScore}
              </span>
              <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 text-[11px] text-sam-muted">
                {TREND_LABELS[b.trend]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
