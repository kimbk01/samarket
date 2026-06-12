"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_EDGE_TYPE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import type { OpsKnowledgeGraphEdgeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphEdges } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import { getOpsKnowledgeGraphNodeById } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";

interface OpsKnowledgeEdgeTableProps {
  edgeTypeFilter?: OpsKnowledgeGraphEdgeType | "";
  sourceNodeId?: string;
}

export function OpsKnowledgeEdgeTable({
  edgeTypeFilter = "",
  sourceNodeId,
}: OpsKnowledgeEdgeTableProps) {
  const { t } = useI18n();
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kg_edges_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_source")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_relation")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_target_col")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_remark")}</th>
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
                  {t(opsToolsLabel(OPS_TOOLS_EDGE_TYPE_KEYS, e.edgeType))}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {target?.title ?? e.targetNodeId}
                </td>
                <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary">{e.note || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
