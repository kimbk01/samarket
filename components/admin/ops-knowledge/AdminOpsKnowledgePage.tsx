"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState, useCallback, useEffect } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsKnowledgeSearchBar } from "./OpsKnowledgeSearchBar";
import { OpsKnowledgeResultList } from "./OpsKnowledgeResultList";
import { OpsKnowledgePreviewCard } from "./OpsKnowledgePreviewCard";
import { OpsKnowledgeRecommendationPanel } from "./OpsKnowledgeRecommendationPanel";
import { OpsKnowledgeRecentViewList } from "./OpsKnowledgeRecentViewList";
import { OpsKnowledgeSearchLogTable } from "./OpsKnowledgeSearchLogTable";
import { OpsKnowledgeRecommendationLogTable } from "./OpsKnowledgeRecommendationLogTable";
import { OpsKnowledgeSummaryCards } from "./OpsKnowledgeSummaryCards";
import { searchOpsKnowledge, logOpsKnowledgeSearch, addRecentView } from "@/lib/ops-knowledge/ops-knowledge-utils";
import type { OpsKnowledgeSearchFilters } from "@/lib/ops-knowledge/ops-knowledge-utils";
import type { OpsKnowledgeBaseIndexItem } from "@/lib/types/ops-knowledge";
import { getOpsKnowledgeBaseIndexItemByDocumentId } from "@/lib/ops-knowledge/ops-knowledge-base-index";
import { loadOpsDocsFromServer } from "@/lib/ops-docs/ops-docs-sync-client";
import {
  loadOpsKnowledgeFromServer,
  persistOpsKnowledgeToServer,
} from "@/lib/ops-knowledge/ops-knowledge-sync-client";
import { invalidateOpsKnowledgeIndexCache } from "@/lib/ops-knowledge/ops-knowledge-base-index";
import type { MessageKey } from "@/lib/i18n/messages";

type TabId = "search" | "recommend" | "recent" | "searchLogs" | "recLogs";

export function AdminOpsKnowledgePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<OpsKnowledgeSearchFilters>({});
  const [searchResults, setSearchResults] = useState<OpsKnowledgeBaseIndexItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [recommendSourceType, setRecommendSourceType] = useState<"incident" | "deployment" | "rollback" | "fallback" | "kill_switch">("incident");
  const [recommendSourceId, setRecommendSourceId] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([loadOpsDocsFromServer(), loadOpsKnowledgeFromServer()]).then(() => {
      invalidateOpsKnowledgeIndexCache();
      setHydrated(true);
    });
  }, []);

  const handleSearch = useCallback(() => {
    const results = searchOpsKnowledge(query, { ...filters, status: "active" });
    setSearchResults(results);
    logOpsKnowledgeSearch(query, filters as Record<string, string>, results.length);
    void persistOpsKnowledgeToServer();
    setSelectedDocumentId(results[0]?.documentId ?? null);
  }, [query, filters]);

  const selectedItem =
    selectedDocumentId
      ? getOpsKnowledgeBaseIndexItemByDocumentId(selectedDocumentId)
      : null;

  const handleViewDocument = useCallback((documentId: string) => {
    addRecentView(documentId, "search");
    void persistOpsKnowledgeToServer();
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_ops_tools_kb_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "search", labelKey: "admin_ops_tools_kb_tab_search" },
    { id: "recommend", labelKey: "admin_ops_tools_kb_tab_recommend" },
    { id: "recent", labelKey: "admin_ops_tools_kb_tab_recent" },
    { id: "searchLogs", labelKey: "admin_ops_tools_kb_tab_search_logs" },
    { id: "recLogs", labelKey: "admin_ops_tools_kb_tab_rec_logs" },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_tools_kb_page_title" />
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

      {activeTab === "search" && (
        <div className="space-y-4">
          <OpsKnowledgeSearchBar
            query={query}
            filters={filters}
            onQueryChange={setQuery}
            onFiltersChange={setFilters}
            onSearch={handleSearch}
          />
          <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
            <AdminCard titleKey="admin_ops_tools_kb_card_results">
              <OpsKnowledgeResultList
                items={searchResults}
                selectedDocumentId={selectedDocumentId}
                onSelectDocument={setSelectedDocumentId}
                onViewDocument={handleViewDocument}
              />
            </AdminCard>
            <AdminCard titleKey="admin_ops_tools_kb_card_preview">
              {selectedItem ? (
                <OpsKnowledgePreviewCard
                  item={selectedItem}
                  onView={handleViewDocument}
                />
              ) : (
                <p className="sam-text-body text-sam-muted">{t("admin_ops_tools_kb_preview_empty")}</p>
              )}
            </AdminCard>
          </div>
        </div>
      )}

      {activeTab === "recommend" && (
        <div className="space-y-4">
          <AdminCard titleKey="admin_ops_tools_kb_card_recommend">
            <div className="mb-4 flex flex-wrap gap-2">
              <label className="sam-text-body text-sam-fg">{t("admin_ops_tools_kb_source_type")}</label>
              <select
                value={recommendSourceType}
                onChange={(e) => setRecommendSourceType(e.target.value as typeof recommendSourceType)}
                className="rounded border border-sam-border px-3 py-2 sam-text-body"
              >
                <option value="incident">{t("admin_ops_tools_rb_link_incident")}</option>
                <option value="deployment">{t("admin_ops_tools_action_src_deployment")}</option>
                <option value="rollback">{t("admin_ops_tools_node_rollback")}</option>
                <option value="fallback">Fallback</option>
                <option value="kill_switch">{t("admin_ops_tools_rb_link_kill_switch")}</option>
              </select>
              <input
                type="text"
                value={recommendSourceId}
                onChange={(e) => setRecommendSourceId(e.target.value)}
                placeholder={t("admin_ops_tools_runbook_link_id")}
                className="w-28 rounded border border-sam-border px-3 py-2 sam-text-body"
              />
            </div>
            <OpsKnowledgeRecommendationPanel
              sourceType={recommendSourceType}
              sourceId={recommendSourceId.trim() || null}
              title={`${recommendSourceType} 기준 관련 문서`}
              compact={false}
            />
          </AdminCard>
        </div>
      )}

      {activeTab === "recent" && (
        <AdminCard titleKey="admin_ops_tools_kb_card_recent">
          <OpsKnowledgeRecentViewList />
        </AdminCard>
      )}

      {activeTab === "searchLogs" && (
        <AdminCard titleKey="admin_ops_tools_kb_tab_search_logs">
          <OpsKnowledgeSummaryCards />
          <div className="mt-4">
            <OpsKnowledgeSearchLogTable />
          </div>
        </AdminCard>
      )}

      {activeTab === "recLogs" && (
        <AdminCard titleKey="admin_ops_tools_kb_tab_rec_logs">
          <OpsKnowledgeRecommendationLogTable />
        </AdminCard>
      )}
    </>
  );
}
