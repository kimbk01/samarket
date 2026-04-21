"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeDocumentRankings } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-document-rankings";
import { getOpsResolutionCases } from "@/lib/ops-knowledge-graph/mock-ops-resolution-cases";
import { getTopLinkedDocumentIds } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-utils";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

interface OpsRelatedDocumentPanelProps {
  title?: string;
  compact?: boolean;
}

export function OpsRelatedDocumentPanel({ title = "관련 문서", compact = false }: OpsRelatedDocumentPanelProps) {
  const rankings = useMemo(() => getOpsKnowledgeDocumentRankings({ limit: 5 }), []);
  const topLinkedIds = useMemo(() => getTopLinkedDocumentIds(5), []);
  const resolvedCases = useMemo(() => getOpsResolutionCases({ limit: 5 }), []);

  const topResolvedDocIds = useMemo(() => {
    const byDoc: Record<string, number> = {};
    resolvedCases.forEach((c) => {
      byDoc[c.primaryDocumentId] = (byDoc[c.primaryDocumentId] ?? 0) + 1;
    });
    return Object.entries(byDoc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }, [resolvedCases]);

  const renderDocLink = (documentId: string) => {
    const doc = getOpsDocumentById(documentId);
    return (
      <Link
        key={documentId}
        href={`/admin/ops-docs/${documentId}`}
        className="block sam-text-body-secondary text-signature hover:underline"
      >
        {doc?.title ?? documentId}
      </Link>
    );
  };

  if (compact) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <h3 className="sam-text-body-secondary font-medium text-sam-fg">{title}</h3>
        <div className="mt-2 space-y-1">
          {rankings.slice(0, 3).map((r) => renderDocLink(r.documentId))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">Top 랭킹 문서</h3>
        <ul className="mt-2 space-y-1">
          {rankings.slice(0, 5).map((r) => (
            <li key={r.id}>{renderDocLink(r.documentId)}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">연결 많은 문서</h3>
        <ul className="mt-2 space-y-1">
          {topLinkedIds.map((id) => (
            <li key={id}>{renderDocLink(id)}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">해결에 많이 사용된 문서</h3>
        <ul className="mt-2 space-y-1">
          {topResolvedDocIds.map((id) => (
            <li key={id}>{renderDocLink(id)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
