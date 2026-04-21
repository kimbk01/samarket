"use client";

import { useState } from "react";
import type { ExposureCandidate } from "@/lib/types/exposure";
import type { ExposureScoreResult } from "@/lib/types/exposure";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import { ExposureResultDetailCard } from "./ExposureResultDetailCard";

interface ExposureResultTableProps {
  results: { candidate: ExposureCandidate; result: ExposureScoreResult }[];
  surface: string;
  policyName: string;
}

export function ExposureResultTable({
  results,
  surface,
  policyName,
}: ExposureResultTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        시뮬레이션 결과가 없습니다. 후보 상품이 없거나 정책을 선택하세요.
      </div>
    );
  }

  const selected = results.find((r) => r.candidate.id === selectedId);

  return (
    <div className="space-y-4">
      <p className="sam-text-body text-sam-muted">
        {policyName} · {results.length}건 (점수순 정렬)
      </p>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[640px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                상품 ID
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                제목
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                판매자 / 구분
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                최종 점수
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                사유
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ candidate, result }) => (
              <tr
                key={candidate.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {candidate.id}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-sam-fg">
                  {candidate.title}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {candidate.sellerNickname} ({MEMBER_TYPE_LABELS[candidate.memberType]})
                </td>
                <td className="px-3 py-2.5 font-semibold text-sam-fg">
                  {result.finalScore}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {result.appliedReasons.join(", ") || "-"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId(selectedId === candidate.id ? null : candidate.id)
                    }
                    className="sam-text-body-secondary text-signature hover:underline"
                  >
                    {selectedId === candidate.id ? "접기" : "상세"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <ExposureResultDetailCard
          candidate={selected.candidate}
          result={selected.result}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
