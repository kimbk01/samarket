"use client";

import { useMemo, useState } from "react";
import { getOpsQuarterlyPlans } from "@/lib/ops-benchmarks/mock-ops-quarterly-plans";
import { OpsQuarterlyPlanCard } from "./OpsQuarterlyPlanCard";
import type {
  OpsQuarterlyPlanStatus,
  OpsBenchmarkDomain,
} from "@/lib/types/ops-benchmarks";

const STATUS_COLUMNS: OpsQuarterlyPlanStatus[] = [
  "planned",
  "approved",
  "in_progress",
  "at_risk",
  "completed",
  "dropped",
];

const STATUS_LABELS: Record<OpsQuarterlyPlanStatus, string> = {
  planned: "예정",
  approved: "승인",
  in_progress: "진행중",
  at_risk: "위험",
  completed: "완료",
  dropped: "중단",
};

const DOMAIN_OPTIONS: { value: OpsBenchmarkDomain | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "recommendation_quality", label: "추천 품질" },
  { value: "incident_response", label: "장애 대응" },
  { value: "automation", label: "자동화" },
  { value: "documentation", label: "문서화" },
  { value: "execution", label: "운영 실행력" },
  { value: "learning", label: "학습/회고" },
];

export function OpsQuarterlyPlanBoard() {
  const [year] = useState(() => new Date().getFullYear());
  const [domainFilter, setDomainFilter] = useState<OpsBenchmarkDomain | "">("");

  const plans = useMemo(
    () => getOpsQuarterlyPlans({ year, domain: domainFilter || undefined }),
    [year, domainFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<OpsQuarterlyPlanStatus, typeof plans> = {
      planned: [],
      approved: [],
      in_progress: [],
      at_risk: [],
      completed: [],
      dropped: [],
    };
    plans.forEach((p) => map[p.status].push(p));
    return map;
  }, [plans]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">도메인</span>
        <select
          value={domainFilter}
          onChange={(e) =>
            setDomainFilter((e.target.value || "") as OpsBenchmarkDomain | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          {DOMAIN_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-sam-muted">{year}년</span>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          분기별 개선 계획이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[900px] gap-4">
            {STATUS_COLUMNS.map((status) => (
              <div
                key={status}
                className="w-[180px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
              >
                <h3 className="mb-2 text-[13px] font-medium text-sam-fg">
                  {STATUS_LABELS[status]} ({byStatus[status].length})
                </h3>
                <div className="space-y-2">
                  {byStatus[status].map((plan) => (
                    <OpsQuarterlyPlanCard key={plan.id} plan={plan} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
