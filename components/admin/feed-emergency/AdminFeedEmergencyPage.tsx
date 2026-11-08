"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "policy", labelKey: "admin_feed_emergency_tab_policy" },
  { id: "sections", labelKey: "admin_feed_emergency_tab_sections" },
  { id: "fallback", labelKey: "admin_feed_emergency_tab_fallback" },
  { id: "stable", labelKey: "admin_feed_emergency_tab_stable" },
  { id: "logs", labelKey: "admin_feed_emergency_tab_logs" },
];

export function AdminFeedEmergencyPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 로그 필터·쪽과 함께 새로고침·링크 공유 시 유지. */
  const activeTab = useAdminUrlTab<TabId>(TABS, "policy");
  /** 불러오기 실패를 기본값 표시로 숨기지 않는다 — 킬스위치 상태를 기본값으로 오인하지 않게 (R6). */
  const { state: loadState, reload } = useAdminSyncLoad(loadFeedEmergencyFromServer);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader titleKey="admin_feed_emergency_kca379512"
          descriptionKey="admin_feed_emergency_page_desc_short"
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
        descriptionKey="admin_feed_emergency_page_desc"
      />
      <AdminTabs
        className="mb-4"
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel={t("admin_feed_emergency_tabs_aria")}
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
