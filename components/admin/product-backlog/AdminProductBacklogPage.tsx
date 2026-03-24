"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ProductBacklogSummaryCards } from "./ProductBacklogSummaryCards";
import { ProductFeedbackTable } from "./ProductFeedbackTable";
import { ProductBacklogBoard } from "./ProductBacklogBoard";
import { OpsDevHandoffTable } from "./OpsDevHandoffTable";

type TabId = "summary" | "feedback" | "backlog" | "handoff";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "요약" },
  { id: "feedback", label: "피드백 인박스" },
  { id: "backlog", label: "백로그 보드" },
  { id: "handoff", label: "운영-개발 handoff" },
];

export function AdminProductBacklogPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  return (
    <>
      <AdminPageHeader title="제품 개선 백로그" />
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
        <AdminCard title="백로그 요약">
          <ProductBacklogSummaryCards />
        </AdminCard>
      )}
      {activeTab === "feedback" && (
        <AdminCard title="사용자 피드백">
          <ProductFeedbackTable />
        </AdminCard>
      )}
      {activeTab === "backlog" && (
        <AdminCard title="백로그 보드">
          <ProductBacklogBoard />
        </AdminCard>
      )}
      {activeTab === "handoff" && (
        <AdminCard title="운영-개발 연동">
          <OpsDevHandoffTable />
        </AdminCard>
      )}
    </>
  );
}
