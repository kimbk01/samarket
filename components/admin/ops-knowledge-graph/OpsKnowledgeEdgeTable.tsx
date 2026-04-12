"use client";

import { useMemo } from "react";
import type { OpsKnowledgeGraphEdgeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphEdges } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-edges";
import { getOpsKnowledgeGraphNodeById } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-nodes";

const EDGE_TYPE_LABELS: Record<OpsKnowledgeGraphEdgeType, string> = {
  related_to: "관련",
  executed_by: "실행함",
  recommended_for: "추천대상",
  derived_from: "파생",
  resolved_with: "해결에 사용",
  followup_of: "후속",
};

interface OpsKnowledgeEdgeTableProps {
  edgeTypeFilter?: OpsKnowledgeGraphEdgeType | "";
  sourceNodeId?: string;
}

export function OpsKnowledgeEdgeTable({
  edgeTypeFilter = "",
  sourceNodeId,
}: OpsKnowledgeEdgeTableProps) {
  const edges = useMemo(
    () =>
      getOpsKnowledgeGraphEdges({
        edgeType: edgeTypeFilter || undefined,
        sourceNodeId,
      }),
    [edgeTypeFilter, sourceNodeId]
  );

  if (edges.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        엣지가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">소스</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">관계</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">타깃</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">비고</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((e) => {
            const source = getOpsKnowledgeGraphNodeById(e.sourceNodeId);
            const target = getOpsKnowledgeGraphNodeById(e.targetNodeId);
            return (
              <tr key={e.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 text-sam-fg">
                  {source?.title ?? e.sourceNodeId}
                </td>
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {EDGE_TYPE_LABELS[e.edgeType]}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {target?.title ?? e.targetNodeId}
                </td>
                <td className="px-3 py-2.5 text-sam-muted text-[13px]">{e.note || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
