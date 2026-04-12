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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        학습 히스토리가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[600px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">제목</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">출처</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">학습 유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">탐지일</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">담당</th>
          </tr>
        </thead>
        <tbody>
          {histories.map((h) => (
            <tr key={h.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{h.title}</span>
                <p className="mt-0.5 text-[12px] text-sam-muted line-clamp-1">{h.summary}</p>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SOURCE_LABELS[h.sourceType]}
                {h.sourceId && ` · ${h.sourceId}`}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {LEARNING_TYPE_LABELS[h.learningType]}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-[12px] text-sam-fg">
                  {STATUS_LABELS[h.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(h.detectedAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {h.ownerAdminNickname ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
