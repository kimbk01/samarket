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
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-[14px] text-gray-500">
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-medium text-gray-900">{node.title}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-gray-500">
        {NODE_TYPE_LABELS[node.nodeType]} · {node.refId}
      </p>
      {node.category && (
        <p className="mt-1 text-[13px] text-gray-600">카테고리: {node.category}</p>
      )}
      {docHref && (
        <Link
          href={docHref}
          className="mt-2 inline-block text-[14px] text-signature hover:underline"
        >
          상세 보기 →
        </Link>
      )}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-[12px] font-medium text-gray-700">
          나가는 관계 {outgoing.length} / 들어오는 관계 {incoming.length}
        </p>
        <p className="mt-1 text-[12px] text-gray-500">
          연결 노드 {connected.length}개
        </p>
      </div>
    </div>
  );
}
