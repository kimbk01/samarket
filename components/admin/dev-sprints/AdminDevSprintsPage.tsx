"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { DevSprintSummaryCards } from "./DevSprintSummaryCards";
import { DevSprintBoard } from "./DevSprintBoard";
import { DevSprintItemTable } from "./DevSprintItemTable";

type TabId = "summary" | "board" | "items";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "요약" },
  { id: "board", label: "스프린트 보드" },
  { id: "items", label: "스프린트 작업" },
];

export function AdminDevSprintsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  return (
    <>
      <AdminPageHeader title="개발 스프린트" />
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
        <AdminCard title="스프린트 요약">
          <DevSprintSummaryCards />
        </AdminCard>
      )}
      {activeTab === "board" && (
        <AdminCard title="스프린트 보드">
          <DevSprintBoard />
        </AdminCard>
      )}
      {activeTab === "items" && (
        <AdminCard title="스프린트 작업 목록">
          <DevSprintItemTable />
        </AdminCard>
      )}
    </>
  );
}
