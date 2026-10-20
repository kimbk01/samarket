"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState, useCallback, useMemo } from "react";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { adminFirstLoadFailure } from "@/lib/admin/admin-load-failure";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  commitOpsKnowledgeChange,
  loadOpsKnowledgeFromServer,
} from "@/lib/ops-knowledge/ops-knowledge-sync-client";
import { invalidateOpsKnowledgeIndexCache } from "@/lib/ops-knowledge/ops-knowledge-base-index";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import {
  OPS_KNOWLEDGE_CATEGORY_FILTER_OPTIONS,
  OPS_KNOWLEDGE_DOC_TYPE_FILTER_OPTIONS,
} from "./ops-knowledge-filter-options";

/** 문서 + 지식 번들 동시 로드 — 하나라도 실패하면 화면은 실패 상태 (기본값을 정상처럼 표시하지 않음). */
async function loadOpsKnowledgeWorkspace() {
  const [docs, kb] = await Promise.all([loadOpsDocsFromServer(), loadOpsKnowledgeFromServer()]);
  invalidateOpsKnowledgeIndexCache();
  const failure = adminFirstLoadFailure([docs, kb]);
  return failure ? { ok: false, error: failure.code, httpStatus: failure.httpStatus } : { ok: true };
}

type TabId = "search" | "recommend" | "recent" | "searchLogs" | "recLogs";

const TAB_DEFS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "search", labelKey: "admin_ops_tools_kb_tab_search" },
  { id: "recommend", labelKey: "admin_ops_tools_kb_tab_recommend" },
  { id: "recent", labelKey: "admin_ops_tools_kb_tab_recent" },
  { id: "searchLogs", labelKey: "admin_ops_tools_kb_tab_search_logs" },
  { id: "recLogs", labelKey: "admin_ops_tools_kb_tab_rec_logs" },
];

/** 주소 키: 검색 탭 `q`·`doc_type`·`category` · 추천 탭 `src_type`·`q`(연결 ID). */
const EXTRAS = ["doc_type", "category", "src_type"] as const;
const RECOMMEND_SOURCE_TYPES = ["incident", "deployment", "rollback", "fallback", "kill_switch"] as const;
type RecommendSourceType = (typeof RECOMMEND_SOURCE_TYPES)[number];

export function AdminOpsKnowledgePage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 탭·검색 조건은 주소에 보존 (R7) — 새로고침·링크 공유·문서 상세에서 돌아올 때 유지. */
  const activeTab = useAdminUrlTab<TabId>(TAB_DEFS, "search");
  const lq = useAdminListQuery({ extras: EXTRAS, extraDefaults: { src_type: "incident" } });
  const filters: OpsKnowledgeSearchFilters = useMemo(
    () => ({
      docType: (lq.query.extras.doc_type || undefined) as OpsKnowledgeSearchFilters["docType"],
      category: (lq.query.extras.category || undefined) as OpsKnowledgeSearchFilters["category"],
    }),
    [lq.query.extras.doc_type, lq.query.extras.category]
  );
  const searched = activeTab === "search";
  /** 결과 = 주소의 조건으로 계산 (고정 상한 50건 없음 — 문서 번들 전체가 대상). */
  const searchResults: OpsKnowledgeBaseIndexItem[] = useMemo(
    () =>
      searched
        ? searchOpsKnowledge(lq.query.q, { ...filters, status: "active" }, { limit: Number.MAX_SAFE_INTEGER })
        : [],
    [searched, lq.query.q, filters]
  );
  const [pickedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const selectedDocumentId =
    pickedDocumentId && searchResults.some((r) => r.documentId === pickedDocumentId)
      ? pickedDocumentId
      : searchResults[0]?.documentId ?? null;
  const recommendSourceType: RecommendSourceType = (RECOMMEND_SOURCE_TYPES as readonly string[]).includes(
    lq.query.extras.src_type
  )
    ? (lq.query.extras.src_type as RecommendSourceType)
    : "incident";
  const recommendSourceId = activeTab === "recommend" ? lq.query.q : "";
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsKnowledgeWorkspace);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);

  /** 「조회」 = 검색 실행 기록(로그) + 조건을 주소에 적용. 결과 표시는 주소 조건으로 다시 계산한다. */
  const handleSearch = useCallback(() => {
    const q = lq.draft.q;
    const results = searchOpsKnowledge(q, { ...filters, status: "active" }, { limit: Number.MAX_SAFE_INTEGER });
    lq.submit();
    void commitOpsKnowledgeChange(() =>
      logOpsKnowledgeSearch(q, filters as Record<string, string>, results.length)
    ).then((r) => setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" }));
  }, [lq, filters]);

  const selectedItem =
    selectedDocumentId
      ? getOpsKnowledgeBaseIndexItemByDocumentId(selectedDocumentId)
      : null;

  const handleViewDocument = useCallback((documentId: string) => {
    void commitOpsKnowledgeChange(() => addRecentView(documentId, "search")).then((r) =>
      setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" })
    );
  }, []);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_kb" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_kb" />
      {saveResult ? (
        <div className="mb-4">
          <AdminResultBanner ko={language !== "en"} result={saveResult} onClose={() => setSaveResult(null)} />
        </div>
      ) : null}
      <AdminTabs
        className="mb-4"
        tabs={TAB_DEFS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="search"
        resetParams={adminSyncTabResetParams(EXTRAS)}
      />

      {activeTab === "search" && (
        <div className="space-y-4">
          <AdminFilterBar
            ko={ko}
            draft={lq.draft}
            onDraftChange={lq.setDraft}
            onSubmit={handleSearch}
            onReset={lq.reset}
            showPeriod={false}
            searchPlaceholder={t("admin_ops_tools_kb_search_ph")}
          >
            <AdminFilterSelect
              ko={ko}
              label={ko ? "문서 유형" : "Doc type"}
              name="doc_type"
              allLabel={t("admin_ops_tools_kb_filter_all_type")}
              value={lq.query.extras.doc_type}
              onChange={(v) => lq.setExtra("doc_type", v)}
              options={OPS_KNOWLEDGE_DOC_TYPE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            />
            <AdminFilterSelect
              ko={ko}
              label={ko ? "분류" : "Category"}
              name="category"
              allLabel={t("admin_ops_tools_kb_filter_all_category")}
              value={lq.query.extras.category}
              onChange={(v) => lq.setExtra("category", v)}
              options={OPS_KNOWLEDGE_CATEGORY_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            />
          </AdminFilterBar>
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
            <AdminFilterBar
              ko={ko}
              className="mb-4"
              draft={lq.draft}
              onDraftChange={lq.setDraft}
              onSubmit={lq.submit}
              onReset={lq.reset}
              showPeriod={false}
              searchPlaceholder={t("admin_ops_tools_runbook_link_id")}
            >
              <AdminFilterSelect
                ko={ko}
                label={t("admin_ops_tools_kb_source_type")}
                name="src_type"
                includeAll={false}
                value={recommendSourceType}
                onChange={(v) => lq.setExtra("src_type", v)}
                options={[
                  { value: "incident", label: t("admin_ops_tools_rb_link_incident") },
                  { value: "deployment", label: t("admin_ops_tools_action_src_deployment") },
                  { value: "rollback", label: t("admin_ops_tools_node_rollback") },
                  { value: "fallback", label: "Fallback" },
                  { value: "kill_switch", label: t("admin_ops_tools_rb_link_kill_switch") },
                ]}
              />
            </AdminFilterBar>
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
