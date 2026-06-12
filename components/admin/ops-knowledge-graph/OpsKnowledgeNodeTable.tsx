"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_NODE_TYPE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodes } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";

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
  const { t } = useI18n();
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kg_nodes_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[520px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_title_ref")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_tpl_category")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_status")}</th>
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
                {t(opsToolsLabel(OPS_TOOLS_NODE_TYPE_KEYS, n.nodeType))}
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
                <span className="ml-1 sam-text-helper text-sam-muted">{n.refId}</span>
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
