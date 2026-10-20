"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import type { MessageKey } from "@/lib/i18n/messages";
import { loadProductBacklogFromServer } from "@/lib/product-backlog/product-backlog-sync-client";
import { ProductBacklogSummaryCards } from "./ProductBacklogSummaryCards";
import { ProductFeedbackTable } from "./ProductFeedbackTable";
import { ProductBacklogBoard } from "./ProductBacklogBoard";
import { OpsDevHandoffTable } from "./OpsDevHandoffTable";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "summary" | "feedback" | "backlog" | "handoff";

export function AdminProductBacklogPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["summary", "feedback", "backlog", "handoff"] as const, "summary");
  const { state: loadState, reload } = useAdminSyncLoad(loadProductBacklogFromServer);
  const hydrated = loadState.status === "ready";

  const tabs = useMemo(
    () =>
      [
        { id: "summary" as const, labelKey: "admin_product_backlog_tab_summary" as MessageKey },
        { id: "feedback" as const, labelKey: "admin_product_backlog_tab_feedback" as MessageKey },
        { id: "backlog" as const, labelKey: "admin_product_backlog_tab_board" as MessageKey },
        { id: "handoff" as const, labelKey: "admin_product_backlog_tab_handoff" as MessageKey },
      ] satisfies { id: TabId; labelKey: MessageKey }[],
    []
  );

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_backlog" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_backlog" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        defaultValue="summary"
        resetParams={adminSyncTabResetParams(["category", "source"])}
        className="mb-4"
      />
      {activeTab === "summary" && (
        <AdminCard titleKey="admin_product_backlog_card_summary">
          <ProductBacklogSummaryCards />
        </AdminCard>
      )}
      {activeTab === "feedback" && (
        <AdminCard titleKey="admin_product_backlog_card_feedback">
          <ProductFeedbackTable />
        </AdminCard>
      )}
      {activeTab === "backlog" && (
        <AdminCard titleKey="admin_product_backlog_card_board">
          <ProductBacklogBoard />
        </AdminCard>
      )}
      {activeTab === "handoff" && (
        <AdminCard titleKey="admin_product_backlog_card_handoff">
          <OpsDevHandoffTable />
        </AdminCard>
      )}
    </>
  );
}
