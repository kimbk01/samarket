"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import type { MessageKey } from "@/lib/i18n/messages";

type TabId = "overview" | "similar" | "ranking" | "resolution" | "explore";

export function AdminOpsKnowledgeGraphPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<OpsKnowledgeGraphNodeType | "">("");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<OpsKnowledgeGraphEdgeType | "">("");

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_ops_tools_kg_tab_overview" },
    { id: "similar", labelKey: "admin_ops_tools_kg_tab_similar" },
    { id: "ranking", labelKey: "admin_ops_tools_kg_tab_ranking" },
    { id: "resolution", labelKey: "admin_ops_tools_kg_tab_resolution" },
    { id: "explore", labelKey: "admin_ops_tools_kg_tab_explore" },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_tools_kg_page_title" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <OpsKnowledgeGraphSummaryCards />
          <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
            <AdminCard titleKey="admin_ops_tools_kg_card_top">
              <OpsRelatedDocumentPanel compact={false} />
            </AdminCard>
            <AdminCard titleKey="admin_ops_tools_kg_card_selected">
              <OpsGraphDetailPanel
                nodeId={selectedNodeId}
                onClose={() => setSelectedNodeId(null)}
              />
            </AdminCard>
          </div>
        </div>
      )}

      {activeTab === "similar" && (
        <AdminCard titleKey="admin_ops_tools_kg_card_similar">
          <OpsSimilarDocumentTable />
        </AdminCard>
      )}

      {activeTab === "ranking" && (
        <AdminCard titleKey="admin_ops_tools_kg_card_ranking">
          <OpsDocumentRankingTable />
        </AdminCard>
      )}

      {activeTab === "resolution" && (
        <AdminCard titleKey="admin_ops_tools_kg_card_resolution">
          <OpsResolutionCaseTable />
        </AdminCard>
      )}

      {activeTab === "explore" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <div className="space-y-4">
            <AdminCard titleKey="admin_ops_tools_kg_card_nodes">
              <div className="mb-3 flex flex-wrap gap-2">
                <select
                  value={nodeTypeFilter}
                  onChange={(e) => setNodeTypeFilter(e.target.value as OpsKnowledgeGraphNodeType | "")}
                  className="rounded border border-sam-border px-3 py-2 sam-text-body"
                >
                  <option value="">{t("admin_ops_tools_kg_filter_node_type")}</option>
                  <option value="document">{t("admin_ops_tools_node_document")}</option>
                  <option value="incident">{t("admin_ops_tools_action_src_incident")}</option>
                  <option value="runbook_execution">{t("admin_ops_tools_node_runbook_exec")}</option>
                  <option value="deployment">{t("admin_ops_tools_action_src_deployment")}</option>
                  <option value="report">{t("admin_ops_tools_action_src_report")}</option>
                  <option value="action_item">{t("admin_ops_tools_node_action")}</option>
                </select>
              </div>
              <OpsKnowledgeNodeTable
                nodeTypeFilter={nodeTypeFilter}
                onSelectNode={setSelectedNodeId}
              />
            </AdminCard>
            <AdminCard titleKey="admin_ops_tools_kg_card_edges">
              <div className="mb-3 flex flex-wrap gap-2">
                <select
                  value={edgeTypeFilter}
                  onChange={(e) => setEdgeTypeFilter(e.target.value as OpsKnowledgeGraphEdgeType | "")}
                  className="rounded border border-sam-border px-3 py-2 sam-text-body"
                >
                  <option value="">{t("admin_ops_tools_kg_filter_edge_type")}</option>
                  <option value="executed_by">{t("admin_ops_tools_edge_executed")}</option>
                  <option value="recommended_for">{t("admin_ops_tools_edge_recommended")}</option>
                  <option value="resolved_with">{t("admin_ops_tools_edge_resolved")}</option>
                  <option value="related_to">{t("admin_ops_tools_edge_related")}</option>
                </select>
              </div>
              <OpsKnowledgeEdgeTable edgeTypeFilter={edgeTypeFilter} />
            </AdminCard>
          </div>
          <AdminCard titleKey="admin_ops_tools_kg_card_detail">
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
