"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodeById } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import { getEdgesForNode, getConnectedNodes } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-utils";
import {
  OPS_TOOLS_NODE_TYPE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

interface OpsGraphDetailPanelProps {
  nodeId: string | null;
  onClose?: () => void;
}

export function OpsGraphDetailPanel({ nodeId, onClose }: OpsGraphDetailPanelProps) {
  const { t } = useI18n();
  const node = useMemo(
    () => (nodeId ? getOpsKnowledgeGraphNodeById(nodeId) : null),
    [nodeId]
  );
  const { outgoing, incoming } = useMemo(
    () => (nodeId ? getEdgesForNode(nodeId) : { outgoing: [], incoming: [] }),
    [nodeId]
  );
  const connected = useMemo(
    () => (nodeId ? getConnectedNodes(nodeId) : []),
    [nodeId]
  );

  if (!nodeId || !node) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kg_detail_empty")}</div>
    );
  }

  const docHref =
    node.nodeType === "document"
      ? `/admin/ops-docs/${node.refId}`
      : node.nodeType === "runbook_execution"
        ? `/admin/ops-runbooks/${node.refId}`
        : null;

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="sam-text-body font-medium text-sam-fg">{node.title}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sam-meta hover:text-sam-muted"
          >
            ×
          </button>
        )}
      </div>
      <p className="mt-1 sam-text-helper text-sam-muted">
        {t(opsToolsLabel(OPS_TOOLS_NODE_TYPE_KEYS, node.nodeType))} · {node.refId}
      </p>
      {node.category && (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("admin_ops_tools_kg_category_label", { category: node.category })}
        </p>
      )}
      {docHref && (
        <Link
          href={docHref}
          className="mt-2 inline-block sam-text-body text-signature hover:underline"
        >{t("admin_ops_tools_kg_view_detail")}</Link>
      )}
      <div className="mt-4 border-t border-sam-border-soft pt-3">
        <p className="sam-text-helper font-medium text-sam-fg">
          {t("admin_ops_tools_kg_outgoing", { out: outgoing.length, in: incoming.length })}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_ops_tools_kg_connected", { count: connected.length })}
        </p>
      </div>
    </div>
  );
}
