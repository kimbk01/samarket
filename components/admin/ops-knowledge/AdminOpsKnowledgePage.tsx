"use client";

import { useState, useCallback } from "react";
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
import { getOpsKnowledgeBaseIndexItemByDocumentId } from "@/lib/ops-knowledge/mock-ops-knowledge-base-index";

type TabId = "search" | "recommend" | "recent" | "searchLogs" | "recLogs";

export function AdminOpsKnowledgePage() {
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<OpsKnowledgeSearchFilters>({});
  const [searchResults, setSearchResults] = useState<OpsKnowledgeBaseIndexItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [recommendSourceType, setRecommendSourceType] = useState<"incident" | "deployment" | "rollback" | "fallback" | "kill_switch">("incident");
  const [recommendSourceId, setRecommendSourceId] = useState("");

  const handleSearch = useCallback(() => {
    const results = searchOpsKnowledge(query, { ...filters, status: "active" });
    setSearchResults(results);
    logOpsKnowledgeSearch(query, filters as Record<string, string>, results.length);
    setSelectedDocumentId(results[0]?.documentId ?? null);
  }, [query, filters]);

  const selectedItem =
    selectedDocumentId
      ? getOpsKnowledgeBaseIndexItemByDocumentId(selectedDocumentId)
      : null;

  const handleViewDocument = useCallback((documentId: string) => {
    addRecentView(documentId, "search");
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "search", label: "검색" },
    { id: "recommend", label: "추천 문서" },
    { id: "recent", label: "최근 열람" },
    { id: "searchLogs", label: "검색 로그" },
    { id: "recLogs", label: "추천 로그" },
  ];

  return (
    <>
      <AdminPageHeader title="운영 지식베이스" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
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
            <AdminCard title="검색 결과">
              <OpsKnowledgeResultList
                items={searchResults}
                selectedDocumentId={selectedDocumentId}
                onSelectDocument={setSelectedDocumentId}
                onViewDocument={handleViewDocument}
              />
            </AdminCard>
            <AdminCard title="미리보기">
              {selectedItem ? (
                <OpsKnowledgePreviewCard
                  item={selectedItem}
                  onView={handleViewDocument}
                />
              ) : (
                <p className="text-[14px] text-gray-500">문서를 선택하면 미리보기가 표시됩니다.</p>
              )}
            </AdminCard>
          </div>
        </div>
      )}

      {activeTab === "recommend" && (
        <div className="space-y-4">
          <AdminCard title="상황별 관련 문서 추천">
            <div className="mb-4 flex flex-wrap gap-2">
              <label className="text-[14px] text-gray-700">출처 유형</label>
              <select
                value={recommendSourceType}
                onChange={(e) => setRecommendSourceType(e.target.value as typeof recommendSourceType)}
                className="rounded border border-gray-200 px-3 py-2 text-[14px]"
              >
                <option value="incident">이슈/인시던트</option>
                <option value="deployment">배포</option>
                <option value="rollback">롤백</option>
                <option value="fallback">Fallback</option>
                <option value="kill_switch">킬스위치</option>
              </select>
              <input
                type="text"
                value={recommendSourceId}
                onChange={(e) => setRecommendSourceId(e.target.value)}
                placeholder="연결 ID (선택)"
                className="w-28 rounded border border-gray-200 px-3 py-2 text-[14px]"
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
        <AdminCard title="최근 열람 문서">
          <OpsKnowledgeRecentViewList />
        </AdminCard>
      )}

      {activeTab === "searchLogs" && (
        <AdminCard title="검색 로그">
          <OpsKnowledgeSummaryCards />
          <div className="mt-4">
            <OpsKnowledgeSearchLogTable />
          </div>
        </AdminCard>
      )}

      {activeTab === "recLogs" && (
        <AdminCard title="추천 로그">
          <OpsKnowledgeRecommendationLogTable />
        </AdminCard>
      )}
    </>
  );
}
