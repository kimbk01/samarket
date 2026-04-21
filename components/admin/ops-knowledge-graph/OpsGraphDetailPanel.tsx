"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodeById } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-nodes";
import { getEdgesForNode, getConnectedNodes } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-utils";

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

interface OpsGraphDetailPanelProps {
  nodeId: string | null;
  onClose?: () => void;
}

export function OpsGraphDetailPanel({ nodeId, onClose }: OpsGraphDetailPanelProps) {
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center sam-text-body text-sam-muted">
        노드를 선택하면 상세가 표시됩니다.
      </div>
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
        {NODE_TYPE_LABELS[node.nodeType]} · {node.refId}
      </p>
      {node.category && (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">카테고리: {node.category}</p>
      )}
      {docHref && (
        <Link
          href={docHref}
          className="mt-2 inline-block sam-text-body text-signature hover:underline"
        >
          상세 보기 →
        </Link>
      )}
      <div className="mt-4 border-t border-sam-border-soft pt-3">
        <p className="sam-text-helper font-medium text-sam-fg">
          나가는 관계 {outgoing.length} / 들어오는 관계 {incoming.length}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          연결 노드 {connected.length}개
        </p>
      </div>
    </div>
  );
}
