"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
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
import { loadOpsKnowledgeGraphWorkspaceFromServer } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "overview" | "similar" | "ranking" | "resolution" | "explore";

const GRAPH_EXTRAS = ["node_type", "edge_type"] as const;

export function AdminOpsKnowledgeGraphPage() {
  const { t, language } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["overview", "similar", "ranking", "resolution", "explore"] as const, "overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** 탐색 탭의 노드·관계 유형 필터는 주소(`?node_type=`·`?edge_type=`)에 보존 (R7). */
  const lq = useAdminListQuery({ extras: GRAPH_EXTRAS });
  const ko = language !== "en";
  const nodeTypeFilter = lq.query.extras.node_type as OpsKnowledgeGraphNodeType | "";
  const edgeTypeFilter = lq.query.extras.edge_type as OpsKnowledgeGraphEdgeType | "";
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsKnowledgeGraphWorkspaceFromServer);
  const hydrated = loadState.status === "ready";

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_ops_tools_kg_tab_overview" },
    { id: "similar", labelKey: "admin_ops_tools_kg_tab_similar" },
    { id: "ranking", labelKey: "admin_ops_tools_kg_tab_ranking" },
    { id: "resolution", labelKey: "admin_ops_tools_kg_tab_resolution" },
    { id: "explore", labelKey: "admin_ops_tools_kg_tab_explore" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_kg" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_kg" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="overview"
        resetParams={adminSyncTabResetParams(["node_type", "edge_type"])}
      />

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
        <div className="space-y-4">
        <AdminFilterBar
          ko={ko}
          draft={lq.draft}
          onDraftChange={lq.setDraft}
          onSubmit={lq.submit}
          onReset={lq.reset}
          showPeriod={false}
          showSearch={false}
        >
          <AdminFilterSelect ko={ko} label={t("admin_ops_tools_kg_card_nodes")} name="node_type" value={lq.query.extras.node_type} onChange={(v) => lq.setExtra("node_type", v)}>
            <option value="">{t("admin_ops_tools_kg_filter_node_type")}</option>
            <option value="document">{t("admin_ops_tools_node_document")}</option>
            <option value="incident">{t("admin_ops_tools_action_src_incident")}</option>
            <option value="runbook_execution">{t("admin_ops_tools_node_runbook_exec")}</option>
            <option value="deployment">{t("admin_ops_tools_action_src_deployment")}</option>
            <option value="report">{t("admin_ops_tools_action_src_report")}</option>
            <option value="action_item">{t("admin_ops_tools_node_action")}</option>
          </AdminFilterSelect>
          <AdminFilterSelect ko={ko} label={t("admin_ops_tools_kg_card_edges")} name="edge_type" value={lq.query.extras.edge_type} onChange={(v) => lq.setExtra("edge_type", v)}>
            <option value="">{t("admin_ops_tools_kg_filter_edge_type")}</option>
            <option value="executed_by">{t("admin_ops_tools_edge_executed")}</option>
            <option value="recommended_for">{t("admin_ops_tools_edge_recommended")}</option>
            <option value="resolved_with">{t("admin_ops_tools_edge_resolved")}</option>
            <option value="related_to">{t("admin_ops_tools_edge_related")}</option>
          </AdminFilterSelect>
        </AdminFilterBar>
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <div className="space-y-4">
            <AdminCard titleKey="admin_ops_tools_kg_card_nodes">
              <OpsKnowledgeNodeTable
                nodeTypeFilter={nodeTypeFilter}
                onSelectNode={setSelectedNodeId}
                onReset={nodeTypeFilter ? lq.reset : undefined}
              />
            </AdminCard>
            <AdminCard titleKey="admin_ops_tools_kg_card_edges">
              <OpsKnowledgeEdgeTable edgeTypeFilter={edgeTypeFilter} onReset={edgeTypeFilter ? lq.reset : undefined} />
            </AdminCard>
          </div>
          <AdminCard titleKey="admin_ops_tools_kg_card_detail">
            <OpsGraphDetailPanel
              nodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
            />
          </AdminCard>
        </div>
        </div>
      )}
    </>
  );
}
