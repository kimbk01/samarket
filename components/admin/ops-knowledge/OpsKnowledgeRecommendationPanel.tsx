"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeRecommendSourceType } from "@/lib/types/ops-knowledge";
import { getRecommendationsForSource } from "@/lib/ops-knowledge/ops-knowledge-utils";
import { logRecommendationClick } from "@/lib/ops-knowledge/ops-knowledge-utils";
import { addRecentView } from "@/lib/ops-knowledge/ops-knowledge-utils";
import type { OpsKnowledgeRecentViewSourceType } from "@/lib/types/ops-knowledge";

const SOURCE_LABELS: Record<OpsKnowledgeRecommendSourceType, string> = {
  incident: "이슈",
  deployment: "배포",
  rollback: "롤백",
  fallback: "Fallback",
  kill_switch: "킬스위치",
  manual_search: "검색",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

interface OpsKnowledgeRecommendationPanelProps {
  sourceType: OpsKnowledgeRecommendSourceType;
  sourceId?: string | null;
  title?: string;
  compact?: boolean;
  recentViewSource?: OpsKnowledgeRecentViewSourceType;
}

export function OpsKnowledgeRecommendationPanel({
  sourceType,
  sourceId = null,
  title,
  compact = false,
  recentViewSource = "incident",
}: OpsKnowledgeRecommendationPanelProps) {
  const rec = useMemo(
    () => getRecommendationsForSource(sourceType, sourceId, 5),
    [sourceType, sourceId]
  );

  const handleClick = (documentId: string) => {
    logRecommendationClick(sourceType, sourceId, documentId);
    addRecentView(documentId, recentViewSource);
  };

  if (rec.items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <h3 className="sam-text-body-secondary font-medium text-sam-fg">
          {title ?? `${SOURCE_LABELS[sourceType]} 관련 문서`}
        </h3>
        <p className="mt-2 sam-text-helper text-sam-muted">추천 문서가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <h3 className="sam-text-body-secondary font-medium text-sam-fg">
        {title ?? `${SOURCE_LABELS[sourceType]} 관련 문서`}
      </h3>
      <ul className={`mt-2 space-y-1 ${compact ? "" : "space-y-2"}`}>
        {rec.items.map((item) => (
          <li key={item.documentId}>
            <Link
              href={`/admin/ops-docs/${item.documentId}`}
              className="block sam-text-body-secondary text-signature hover:underline"
              onClick={() => handleClick(item.documentId)}
            >
              {item.title}
            </Link>
            {!compact && (
              <p className="mt-0.5 sam-text-xxs text-sam-muted">
                {item.reasonLabel} · {(item.score * 100).toFixed(0)}%
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
