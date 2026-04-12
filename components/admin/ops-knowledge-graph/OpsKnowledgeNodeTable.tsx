"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodes } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-nodes";

const NODE_TYPE_LABELS: Record<OpsKnowledgeGraphNodeType, string> = {
  document: "문서",
  incident: "이슈",
  deployment: "배포",
  rollback: "롤백",
  fallback: "Fallback",
  report: "보고서",
  runbook_execution: "런북실행",
  action_item: "액션",
};

interface OpsKnowledgeNodeTableProps {
  nodeTypeFilter?: OpsKnowledgeGraphNodeType | "";
  categoryFilter?: string;
  onSelectNode?: (nodeId: string) => void;
}

export function OpsKnowledgeNodeTable({
  nodeTypeFilter = "",
  categoryFilter = "",
  onSelectNode,
}: OpsKnowledgeNodeTableProps) {
  const nodes = useMemo(
    () =>
      getOpsKnowledgeGraphNodes({
        nodeType: nodeTypeFilter || undefined,
        category: categoryFilter || undefined,
      }),
    [nodeTypeFilter, categoryFilter]
  );

  if (nodes.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        노드가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">제목 / refId</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">카테고리</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr
              key={n.id}
              className="border-b border-sam-border-soft hover:bg-sam-app cursor-pointer"
              onClick={() => onSelectNode?.(n.id)}
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {NODE_TYPE_LABELS[n.nodeType]}
              </td>
              <td className="px-3 py-2.5">
                {n.nodeType === "document" ? (
                  <Link
                    href={`/admin/ops-docs/${n.refId}`}
                    className="font-medium text-signature hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {n.title}
                  </Link>
                ) : (
                  <span className="font-medium text-sam-fg">{n.title}</span>
                )}
                <span className="ml-1 text-[12px] text-sam-muted">{n.refId}</span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{n.category ?? "-"}</td>
              <td className="px-3 py-2.5 text-sam-muted">{n.status ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
