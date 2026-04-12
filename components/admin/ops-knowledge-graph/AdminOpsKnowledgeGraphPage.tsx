"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsKnowledgeGraphSummaryCards } from "./OpsKnowledgeGraphSummaryCards";
import { OpsKnowledgeNodeTable } from "./OpsKnowledgeNodeTable";
import { OpsKnowledgeEdgeTable } from "./OpsKnowledgeEdgeTable";
import { OpsSimilarDocumentTable } from "./OpsSimilarDocumentTable";
import { OpsDocumentRankingTable } from "./OpsDocumentRankingTable";
import { OpsResolutionCaseTable } from "./OpsResolutionCaseTable";
import { OpsGraphDetailPanel } from "./OpsGraphDetailPanel";
import { OpsRelatedDocumentPanel } from "./OpsRelatedDocumentPanel";
import type { OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import type { OpsKnowledgeGraphEdgeType } from "@/lib/types/ops-knowledge-graph";

type TabId = "overview" | "similar" | "ranking" | "resolution" | "explore";

export function AdminOpsKnowledgeGraphPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<OpsKnowledgeGraphNodeType | "">("");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<OpsKnowledgeGraphEdgeType | "">("");

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "그래프 개요" },
    { id: "similar", label: "유사 문서" },
    { id: "ranking", label: "문서 랭킹" },
    { id: "resolution", label: "해결 사례" },
    { id: "explore", label: "노드/엣지 탐색" },
  ];

  return (
    <>
      <AdminPageHeader title="운영 지식 그래프" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <OpsKnowledgeGraphSummaryCards />
          <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
            <AdminCard title="Top / 해결 문서">
              <OpsRelatedDocumentPanel compact={false} />
            </AdminCard>
            <AdminCard title="선택 노드">
              <OpsGraphDetailPanel
                nodeId={selectedNodeId}
                onClose={() => setSelectedNodeId(null)}
              />
            </AdminCard>
          </div>
        </div>
      )}

      {activeTab === "similar" && (
        <AdminCard title="유사 문서 추천">
          <OpsSimilarDocumentTable />
        </AdminCard>
      )}

      {activeTab === "ranking" && (
        <AdminCard title="문서 랭킹 (조회·추천클릭·해결연계·최근업데이트)">
          <OpsDocumentRankingTable />
        </AdminCard>
      )}

      {activeTab === "resolution" && (
        <AdminCard title="해결 사례 (이슈·문서·런북 실행·결과)">
          <OpsResolutionCaseTable />
        </AdminCard>
      )}

      {activeTab === "explore" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <div className="space-y-4">
            <AdminCard title="노드">
              <div className="mb-3 flex flex-wrap gap-2">
                <select
                  value={nodeTypeFilter}
                  onChange={(e) => setNodeTypeFilter(e.target.value as OpsKnowledgeGraphNodeType | "")}
                  className="rounded border border-sam-border px-3 py-2 text-[14px]"
                >
                  <option value="">전체 유형</option>
                  <option value="document">문서</option>
                  <option value="incident">이슈</option>
                  <option value="runbook_execution">런북실행</option>
                  <option value="deployment">배포</option>
                  <option value="report">보고서</option>
                  <option value="action_item">액션</option>
                </select>
              </div>
              <OpsKnowledgeNodeTable
                nodeTypeFilter={nodeTypeFilter}
                onSelectNode={setSelectedNodeId}
              />
            </AdminCard>
            <AdminCard title="엣지">
              <div className="mb-3 flex flex-wrap gap-2">
                <select
                  value={edgeTypeFilter}
                  onChange={(e) => setEdgeTypeFilter(e.target.value as OpsKnowledgeGraphEdgeType | "")}
                  className="rounded border border-sam-border px-3 py-2 text-[14px]"
                >
                  <option value="">전체 관계</option>
                  <option value="executed_by">실행함</option>
                  <option value="recommended_for">추천대상</option>
                  <option value="resolved_with">해결에 사용</option>
                  <option value="related_to">관련</option>
                </select>
              </div>
              <OpsKnowledgeEdgeTable edgeTypeFilter={edgeTypeFilter} />
            </AdminCard>
          </div>
          <AdminCard title="노드 상세">
            <OpsGraphDetailPanel
              nodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
            />
          </AdminCard>
        </div>
      )}
    </>
  );
}
