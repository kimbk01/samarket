"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsImprovementSuggestions } from "@/lib/ops-learning/mock-ops-improvement-suggestions";
import type { OpsSuggestionStatus } from "@/lib/types/ops-learning";

const TYPE_LABELS: Record<string, string> = {
  document_update: "문서 수정",
  new_runbook: "신규 런북",
  automation_rule: "자동화 규칙",
  rollback_policy: "롤백 정책",
  section_disable_rule: "섹션 비활성 규칙",
  alert_threshold_change: "알림 임계치",
};

const STATUS_LABELS: Record<OpsSuggestionStatus, string> = {
  proposed: "제안",
  approved: "승인",
  rejected: "반려",
  implemented: "적용완료",
};

interface OpsImprovementSuggestionTableProps {
  patternId?: string | null;
  compact?: boolean;
}

export function OpsImprovementSuggestionTable({
  patternId = null,
  compact = false,
}: OpsImprovementSuggestionTableProps) {
  const suggestions = useMemo(
    () => getOpsImprovementSuggestions({ patternId: patternId ?? undefined }),
    [patternId]
  );

  if (suggestions.length === 0) {
    return (
      <div className="rounded border border-sam-border-soft bg-sam-surface py-4 text-center text-[13px] text-sam-muted">
        개선 제안이 없습니다.
      </div>
    );
  }

  if (compact) {
    return (
      <div>
        <p className="text-[12px] font-medium text-sam-fg">개선 제안</p>
        <ul className="mt-1 space-y-1 text-[13px] text-sam-fg">
          {suggestions.slice(0, 3).map((s) => (
            <li key={s.id}>
              {s.title} · {STATUS_LABELS[s.status]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">제목</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">액션</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">
                {TYPE_LABELS[s.suggestionType]}
              </td>
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{s.title}</span>
                <p className="mt-0.5 text-[12px] text-sam-muted line-clamp-1">{s.description}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-[12px] text-sam-fg">
                  {STATUS_LABELS[s.status]}
                </span>
              </td>
              <td className="px-3 py-2.5">
                {s.linkedActionItemId ? (
                  <Link
                    href="/admin/ops-board"
                    className="text-signature hover:underline"
                  >
                    {s.linkedActionItemId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
