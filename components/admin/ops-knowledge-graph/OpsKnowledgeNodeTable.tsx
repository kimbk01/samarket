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
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        노드가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">제목 / refId</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">카테고리</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr
              key={n.id}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelectNode?.(n.id)}
            >
              <td className="px-3 py-2.5 text-gray-700">
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
                  <span className="font-medium text-gray-900">{n.title}</span>
                )}
                <span className="ml-1 text-[12px] text-gray-500">{n.refId}</span>
              </td>
              <td className="px-3 py-2.5 text-gray-600">{n.category ?? "-"}</td>
              <td className="px-3 py-2.5 text-gray-600">{n.status ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
