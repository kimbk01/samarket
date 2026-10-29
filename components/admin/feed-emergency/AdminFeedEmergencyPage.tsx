"use client";


import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { FeedEmergencyPolicyTable } from "./FeedEmergencyPolicyTable";
import { FeedSectionOverrideTable } from "./FeedSectionOverrideTable";
import { FeedFallbackStateCard } from "./FeedFallbackStateCard";
import { StableFeedVersionTable } from "./StableFeedVersionTable";
import { FeedEmergencyLogList } from "./FeedEmergencyLogList";
import { loadFeedEmergencyFromServer } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "policy" | "sections" | "fallback" | "stable" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "장애 대응 정책" },
  { id: "sections", label: "섹션 오버라이드" },
  { id: "fallback", label: "Fallback 상태" },
  { id: "stable", label: "안정 버전" },
  { id: "logs", label: "긴급 조치 로그" },
];

export function AdminFeedEmergencyPage() {
  /** 탭은 주소(`?tab=`)에 보존 — 로그 필터·쪽과 함께 새로고침·링크 공유 시 유지. */
  const activeTab = useAdminUrlTab<TabId>(TABS, "policy");
  /** 불러오기 실패를 기본값 표시로 숨기지 않는다 — 킬스위치 상태를 기본값으로 오인하지 않게 (R6). */
  const { state: loadState, reload } = useAdminSyncLoad(loadFeedEmergencyFromServer);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader titleKey="admin_feed_emergency_kca379512"
          description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그"
        />
        <AdminCard>
          <AdminSyncLoadGate state={loadState} onRetry={reload} />
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_feed_emergency_kca379512"
        description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그 — 변경 시 운영 설정 저장소에 저장됩니다."
      />
      <AdminTabs
        className="mb-4"
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        defaultValue="policy"
        resetParams={adminSyncTabResetParams(["surface"])}
      />
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
