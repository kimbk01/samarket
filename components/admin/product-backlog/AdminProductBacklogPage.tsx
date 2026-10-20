"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import type { MessageKey } from "@/lib/i18n/messages";
import { loadProductBacklogFromServer } from "@/lib/product-backlog/product-backlog-sync-client";
import { ProductBacklogSummaryCards } from "./ProductBacklogSummaryCards";
import { ProductFeedbackTable } from "./ProductFeedbackTable";
import { ProductBacklogBoard } from "./ProductBacklogBoard";
import { OpsDevHandoffTable } from "./OpsDevHandoffTable";

type TabId = "summary" | "feedback" | "backlog" | "handoff";

export function AdminProductBacklogPage() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadProductBacklogFromServer().then(() => setHydrated(true));
  }, []);

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
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_backlog" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
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
