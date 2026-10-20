"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { FeedEmergencyPolicyTable } from "./FeedEmergencyPolicyTable";
import { FeedSectionOverrideTable } from "./FeedSectionOverrideTable";
import { FeedFallbackStateCard } from "./FeedFallbackStateCard";
import { StableFeedVersionTable } from "./StableFeedVersionTable";
import { FeedEmergencyLogList } from "./FeedEmergencyLogList";
import { loadFeedEmergencyFromServer } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";

type TabId = "policy" | "sections" | "fallback" | "stable" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "장애 대응 정책" },
  { id: "sections", label: "섹션 오버라이드" },
  { id: "fallback", label: "Fallback 상태" },
  { id: "stable", label: "안정 버전" },
  { id: "logs", label: "긴급 조치 로그" },
];

export function AdminFeedEmergencyPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadFeedEmergencyFromServer().then((r) => {
      if (!r.ok) setHydrateError(r.error ?? "load_failed");
      setHydrated(true);
    });
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_feed_emergency_kca379512"
          description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그"
        />
        <AdminCard>
          <AdminLoadingState ko label={t("admin_loading_ops_settings")} />
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_feed_emergency_kca379512"
        description="킬스위치·섹션 비활성화·Fallback·긴급 조치 로그 — 변경 시 DB(admin_settings)에 저장됩니다."
      />
      {hydrateError && (
        <div
          className="mb-4 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          서버에서 피드 긴급 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({adminOperatorErrorMessage(hydrateError, true)})
        </div>
      )}
      <AdminTabs
        className="mb-4"
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
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
