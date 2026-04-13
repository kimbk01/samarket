"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { FeedEmergencyPolicyTable } from "./FeedEmergencyPolicyTable";
import { FeedSectionOverrideTable } from "./FeedSectionOverrideTable";
import { FeedFallbackStateCard } from "./FeedFallbackStateCard";
import { StableFeedVersionTable } from "./StableFeedVersionTable";
import { FeedEmergencyLogList } from "./FeedEmergencyLogList";
import { loadFeedEmergencyFromServer } from "@/lib/feed-emergency/feed-emergency-sync-client";

type TabId = "policy" | "sections" | "fallback" | "stable" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "장애 대응 정책" },
  { id: "sections", label: "섹션 오버라이드" },
  { id: "fallback", label: "Fallback 상태" },
  { id: "stable", label: "안정 버전" },
  { id: "logs", label: "긴급 조치 로그" },
];

export function AdminFeedEmergencyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadFeedEmergencyFromServer().then((r) => {
      if (!r.ok) setHydrateError(r.error ?? "불러오기 실패");
      setHydrated(true);
    });
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          title="피드 장애 대응"
          description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그"
        />
        <AdminCard>
          <p className="py-8 text-center text-[14px] text-sam-muted">운영 설정을 불러오는 중…</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="피드 장애 대응"
        description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그 — 변경 시 DB(admin_settings)에 저장됩니다."
      />
      {hydrateError && (
        <div
          className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-sam-fg"
          role="alert"
        >
          서버에서 피드 긴급 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({hydrateError})
        </div>
      )}
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
