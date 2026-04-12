"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationRulesTable } from "./AutomationRulesTable";
import { AutomationLogList } from "./AutomationLogList";

type TabId = "rules" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "rules", label: "자동화 룰" },
  { id: "logs", label: "실행 로그" },
];

export function AdminAutomationPage() {
  const [activeTab, setActiveTab] = useState<TabId>("rules");

  return (
    <>
      <AdminPageHeader title="운영 자동화" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
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
      {activeTab === "rules" && (
        <AdminCard title="자동화 룰 테이블">
          <AutomationRulesTable />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard title="실행 로그">
          <AutomationLogList />
        </AdminCard>
      )}
    </>
  );
}
