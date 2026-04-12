"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getPatternConnections } from "@/lib/ops-learning/ops-learning-utils";
import { OpsPatternLogList } from "./OpsPatternLogList";
import { OpsImprovementSuggestionTable } from "./OpsImprovementSuggestionTable";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";

const STATUS_LABELS: Record<OpsLearningStatus, string> = {
  detected: "탐지",
  reviewing: "검토중",
  action_created: "액션생성",
  mitigated: "완화",
  monitoring: "모니터링",
  closed: "종료",
};

interface OpsPatternDetailPanelProps {
  patternId: string | null;
  onClose?: () => void;
}

export function OpsPatternDetailPanel({ patternId, onClose }: OpsPatternDetailPanelProps) {
  const connections = useMemo(
    () => (patternId ? getPatternConnections(patternId) : null),
    [patternId]
  );

  if (!patternId || !connections) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center text-[14px] text-sam-muted">
        패턴을 선택하면 상세가 표시됩니다.
      </div>
    );
  }

  const { pattern, linkedDocument, linkedRunbookDocument, suggestions } = connections;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-medium text-sam-fg">{pattern.title}</h3>
          <p className="mt-1 text-[12px] text-sam-muted">{pattern.patternKey}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-sam-meta hover:text-sam-muted">
            ×
          </button>
        )}
      </div>
      <div className="rounded border border-sam-border-soft bg-sam-app p-3 text-[13px]">
        <p>발생 {pattern.occurrenceCount}회 · {pattern.surface} · {pattern.incidentType}</p>
        <p className="mt-1 text-sam-muted">
          첫 발생 {new Date(pattern.firstOccurredAt).toLocaleDateString("ko-KR")} · 마지막 {new Date(pattern.lastOccurredAt).toLocaleDateString("ko-KR")}
        </p>
        <p className="mt-1">
          상태: <span className="font-medium">{STATUS_LABELS[pattern.status]}</span>
        </p>
      </div>
      <div>
        <p className="text-[12px] font-medium text-sam-fg">연결 문서</p>
        <div className="mt-1 space-y-1">
          {linkedDocument && (
            <Link href={`/admin/ops-docs/${pattern.linkedDocumentId}`} className="block text-[13px] text-signature hover:underline">
              문서: {linkedDocument.title}
            </Link>
          )}
          {linkedRunbookDocument && pattern.linkedRunbookDocumentId && (
            <Link href={`/admin/ops-docs/${pattern.linkedRunbookDocumentId}`} className="block text-[13px] text-signature hover:underline">
              런북 문서: {linkedRunbookDocument.title}
            </Link>
          )}
          {!linkedDocument && !linkedRunbookDocument && (
            <span className="text-[13px] text-sam-muted">연결된 문서 없음</span>
          )}
        </div>
      </div>
      <OpsImprovementSuggestionTable patternId={patternId} compact />
      <OpsPatternLogList patternId={patternId} />
    </div>
  );
}
