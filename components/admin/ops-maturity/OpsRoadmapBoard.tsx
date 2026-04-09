"use client";

import { useMemo, useState } from "react";
import type { OpsRoadmapStatus, OpsRoadmapDomain } from "@/lib/types/ops-maturity";
import { getOpsImprovementRoadmapItems } from "@/lib/ops-maturity/mock-ops-improvement-roadmap-items";
import { OpsRoadmapCard } from "./OpsRoadmapCard";

const STATUS_COLUMNS: OpsRoadmapStatus[] = [
  "planned",
  "approved",
  "in_progress",
  "blocked",
  "completed",
  "deferred",
];

const STATUS_LABELS: Record<OpsRoadmapStatus, string> = {
  planned: "예정",
  approved: "승인",
  in_progress: "진행중",
  blocked: "차단",
  completed: "완료",
  deferred: "보류",
};

export function OpsRoadmapBoard() {
  const [domainFilter, setDomainFilter] = useState<OpsRoadmapDomain | "">("");

  const items = useMemo(
    () => getOpsImprovementRoadmapItems({ domain: domainFilter || undefined }),
    [domainFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<OpsRoadmapStatus, typeof items> = {
      planned: [],
      approved: [],
      in_progress: [],
      blocked: [],
      completed: [],
      deferred: [],
    };
    items.forEach((i) => {
      if (map[i.status]) map[i.status].push(i);
    });
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value as OpsRoadmapDomain | "")}
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 영역</option>
          <option value="monitoring">모니터링</option>
          <option value="automation">자동화</option>
          <option value="documentation">문서화</option>
          <option value="response">대응</option>
          <option value="recommendation_quality">추천 품질</option>
          <option value="learning">학습</option>
        </select>
      </div>
      <div className="grid gap-3 overflow-x-auto lg:grid-cols-6">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="min-w-[200px] rounded-ui-rect border border-gray-200 bg-gray-50/50 p-3">
            <h3 className="mb-2 text-[13px] font-medium text-gray-700">
              {STATUS_LABELS[status]} ({byStatus[status].length})
            </h3>
            <div className="space-y-2">
              {byStatus[status].map((item) => (
                <OpsRoadmapCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
