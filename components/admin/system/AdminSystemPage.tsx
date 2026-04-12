"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OperationStatusCards } from "./OperationStatusCards";
import { SystemHealthList } from "./SystemHealthList";

type TabId = "overview" | "services";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "전체 상태" },
  { id: "services", label: "서비스 상태" },
];

export function AdminSystemPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <>
      <AdminPageHeader title="최종 안정화 운영 체계" />
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
      {activeTab === "overview" && (
        <AdminCard title="전체 시스템 상태 요약">
          <OperationStatusCards />
        </AdminCard>
      )}
      {activeTab === "services" && (
        <AdminCard title="서비스 health 리스트">
          <SystemHealthList />
        </AdminCard>
      )}
    </>
  );
}
