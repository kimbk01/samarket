"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsActionSummaryCards } from "./OpsActionSummaryCards";
import { OpsChecklistTable } from "./OpsChecklistTable";
import { OpsChecklistTemplateTable } from "./OpsChecklistTemplateTable";
import { OpsRetrospectiveList } from "./OpsRetrospectiveList";
import { OpsRetrospectiveForm } from "./OpsRetrospectiveForm";
import { OpsActionBoard } from "./OpsActionBoard";

type TabId =
  | "summary"
  | "checklist"
  | "templates"
  | "retro"
  | "actions";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "요약 카드" },
  { id: "checklist", label: "일일 체크리스트" },
  { id: "templates", label: "체크리스트 템플릿" },
  { id: "retro", label: "운영 회고" },
  { id: "actions", label: "액션아이템 보드" },
];

export function AdminOpsBoardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [retroRefresh, setRetroRefresh] = useState(0);

  return (
    <>
      <AdminPageHeader
        title="운영 보드"
        description="일일 점검 체크리스트·운영 회고·액션아이템"
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
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
      {activeTab === "summary" && (
        <AdminCard title="운영 요약">
          <OpsActionSummaryCards />
        </AdminCard>
      )}
      {activeTab === "checklist" && (
        <AdminCard title="일일 점검 체크리스트">
          <OpsChecklistTable />
        </AdminCard>
      )}
      {activeTab === "templates" && (
        <AdminCard title="체크리스트 템플릿">
          <OpsChecklistTemplateTable />
        </AdminCard>
      )}
      {activeTab === "retro" && (
        <div className="space-y-4">
          <OpsRetrospectiveForm onSaved={() => setRetroRefresh((r) => r + 1)} />
          <AdminCard title="회고 목록">
            <OpsRetrospectiveList refreshKey={retroRefresh} />
          </AdminCard>
        </div>
      )}
      {activeTab === "actions" && (
        <AdminCard title="액션아이템 보드">
          <OpsActionBoard />
        </AdminCard>
      )}
    </>
  );
}
