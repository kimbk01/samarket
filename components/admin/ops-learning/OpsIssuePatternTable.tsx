"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import { getOpsIssuePatterns } from "@/lib/ops-learning/mock-ops-issue-patterns";

const STATUS_LABELS: Record<OpsLearningStatus, string> = {
  detected: "탐지",
  reviewing: "검토중",
  action_created: "액션생성",
  mitigated: "완화",
  monitoring: "모니터링",
  closed: "종료",
};

const SURFACE_LABELS: Record<string, string> = {
  home: "홈",
  search: "검색",
  shop: "상점",
  all: "전체",
};

const TREND_LABELS: Record<string, string> = {
  stable: "안정",
  increasing: "증가",
  decreasing: "감소",
};

interface OpsIssuePatternTableProps {
  statusFilter?: OpsLearningStatus | "";
  onSelectPattern?: (patternId: string) => void;
}

export function OpsIssuePatternTable({
  statusFilter = "",
  onSelectPattern,
}: OpsIssuePatternTableProps) {
  const patterns = useMemo(
    () => getOpsIssuePatterns({ status: statusFilter || undefined }),
    [statusFilter]
  );

  if (patterns.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        반복 패턴이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">패턴</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">surface / 유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">발생</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">추세</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">연결 문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelectPattern?.(p.id)}
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-gray-900">{p.title}</span>
                <p className="text-[12px] text-gray-500">{p.patternKey}</p>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SURFACE_LABELS[p.surface]} · {p.incidentType}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {p.occurrenceCount}회
                {p.avgResolutionMinutes != null && ` / 약 ${p.avgResolutionMinutes}분`}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {TREND_LABELS[p.severityTrend]}
              </td>
              <td className="px-3 py-2.5">
                {p.linkedDocumentId ? (
                  <Link
                    href={`/admin/ops-docs/${p.linkedDocumentId}`}
                    className="text-signature hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.linkedDocumentId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[12px] text-gray-700">
                  {STATUS_LABELS[p.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
