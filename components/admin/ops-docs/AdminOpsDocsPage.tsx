"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  OPS_DOC_LIST_QUERY_CONFIG,
  OpsDocumentFilterBar,
  opsDocumentFilterStateFromQuery,
} from "./OpsDocumentFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { OpsDocumentTable } from "./OpsDocumentTable";
import { OpsDocumentSummaryCards } from "./OpsDocumentSummaryCards";
import { loadOpsDocsFromServer } from "@/lib/ops-docs/ops-docs-sync-client";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";

export function AdminOpsDocsPage() {
  const { t } = useI18n();
  /** 검색·필터·정렬·보기(목록/요약)는 주소에 보존 (R7). */
  const lq = useAdminListQuery(OPS_DOC_LIST_QUERY_CONFIG);
  const filterState = opsDocumentFilterStateFromQuery(lq.query);
  const activeTab = lq.query.extras.view === "summary" ? "summary" : "list";
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsDocsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_docs" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_docs" />
      {/* 필터 바 [조회] 가 화면 주 동작 — 작성·보기 전환은 보조 (설계 2-2, 머리글 오른쪽) */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <AdminActionButton
          variant="secondary"
          onClick={() => lq.setExtra("view", activeTab === "list" ? "summary" : "")}
        >
          {activeTab === "list" ? t("admin_ops_doc_view_summary") : t("admin_ops_doc_view_list")}
        </AdminActionButton>
        <AdminActionLink href="/admin/ops-docs/create" variant="secondary">
          {t("admin_ops_doc_create")}
        </AdminActionLink>
      </div>
      {activeTab === "summary" ? (
        <AdminCard titleKey="admin_ops_doc_card_summary">
          <OpsDocumentSummaryCards />
        </AdminCard>
      ) : (
        <>
          <div className="mb-4">
            <OpsDocumentFilterBar lq={lq} />
          </div>
          <AdminCard titleKey="admin_ops_doc_card_list">
            <OpsDocumentTable filterState={filterState} onReset={lq.isFiltered ? lq.reset : undefined} />
          </AdminCard>
        </>
      )}
    </>
  );
}
