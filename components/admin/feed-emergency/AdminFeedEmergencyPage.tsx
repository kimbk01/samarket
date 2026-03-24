"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { FeedEmergencyPolicyTable } from "./FeedEmergencyPolicyTable";
import { FeedSectionOverrideTable } from "./FeedSectionOverrideTable";
import { FeedFallbackStateCard } from "./FeedFallbackStateCard";
import { StableFeedVersionTable } from "./StableFeedVersionTable";
import { FeedEmergencyLogList } from "./FeedEmergencyLogList";

type TabId =
  | "policy"
  | "sections"
  | "fallback"
  | "stable"
  | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "장애 대응 정책" },
  { id: "sections", label: "섹션 오버라이드" },
  { id: "fallback", label: "Fallback 상태" },
  { id: "stable", label: "안정 버전" },
  { id: "logs", label: "긴급 조치 로그" },
];

export function AdminFeedEmergencyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");

  return (
    <>
      <AdminPageHeader
        title="피드 장애 대응"
        description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그"
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
      <AdminCard>
        {activeTab === "policy" && <FeedEmergencyPolicyTable />}
        {activeTab === "sections" && <FeedSectionOverrideTable />}
        {activeTab === "fallback" && <FeedFallbackStateCard />}
        {activeTab === "stable" && <StableFeedVersionTable />}
        {activeTab === "logs" && <FeedEmergencyLogList />}
      </AdminCard>
    </>
  );
}
