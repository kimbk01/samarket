"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { MessageKey } from "@/lib/i18n/messages";
import { ProductBacklogSummaryCards } from "./ProductBacklogSummaryCards";
import { ProductFeedbackTable } from "./ProductFeedbackTable";
import { ProductBacklogBoard } from "./ProductBacklogBoard";
import { OpsDevHandoffTable } from "./OpsDevHandoffTable";

type TabId = "summary" | "feedback" | "backlog" | "handoff";

export function AdminProductBacklogPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("summary");

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

  return (
    <>
      <AdminPageHeader titleKey="admin_product_backlog_page_title" />
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
