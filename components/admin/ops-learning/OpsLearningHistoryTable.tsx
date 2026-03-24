"use client";

import { useMemo } from "react";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import { getOpsLearningHistories } from "@/lib/ops-learning/mock-ops-learning-histories";

const SOURCE_LABELS: Record<string, string> = {
  incident: "이슈",
  runbook: "런북",
  report: "보고서",
  automation: "자동화",
  manual: "수동",
};

const LEARNING_TYPE_LABELS: Record<string, string> = {
  repeated_issue: "반복 이슈",
  recovery_gap: "복구 갭",
  document_gap: "문서 갭",
  automation_gap: "자동화 갭",
  quality_improvement: "품질 개선",
};

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

interface OpsLearningHistoryTableProps {
  statusFilter?: OpsLearningStatus | "";
}

export function OpsLearningHistoryTable({ statusFilter = "" }: OpsLearningHistoryTableProps) {
  const histories = useMemo(
    () => getOpsLearningHistories({ status: statusFilter || undefined }),
    [statusFilter]
  );

  if (histories.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        학습 히스토리가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[600px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">제목</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">출처</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">학습 유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">탐지일</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">담당</th>
          </tr>
        </thead>
        <tbody>
          {histories.map((h) => (
            <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <span className="font-medium text-gray-900">{h.title}</span>
                <p className="mt-0.5 text-[12px] text-gray-500 line-clamp-1">{h.summary}</p>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {SOURCE_LABELS[h.sourceType]}
                {h.sourceId && ` · ${h.sourceId}`}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {LEARNING_TYPE_LABELS[h.learningType]}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[12px] text-gray-700">
                  {STATUS_LABELS[h.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-600">
                {new Date(h.detectedAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-gray-600">
                {h.ownerAdminNickname ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
