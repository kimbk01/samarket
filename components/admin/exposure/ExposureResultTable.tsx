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
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        시뮬레이션 결과가 없습니다. 후보 상품이 없거나 정책을 선택하세요.
      </div>
    );
  }

  const selected = results.find((r) => r.candidate.id === selectedId);

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600">
        {policyName} · {results.length}건 (점수순 정렬)
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                상품 ID
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                제목
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                판매자 / 구분
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                최종 점수
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                사유
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ candidate, result }) => (
              <tr
                key={candidate.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {candidate.id}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-700">
                  {candidate.title}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-600">
                  {candidate.sellerNickname} ({MEMBER_TYPE_LABELS[candidate.memberType]})
                </td>
                <td className="px-3 py-2.5 font-semibold text-gray-900">
                  {result.finalScore}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                  {result.appliedReasons.join(", ") || "-"}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId(selectedId === candidate.id ? null : candidate.id)
                    }
                    className="text-[13px] text-signature hover:underline"
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
