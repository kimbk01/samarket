"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { HealthSummaryCards } from "./HealthSummaryCards";
import { SurfaceHealthTable } from "./SurfaceHealthTable";
import { SectionHealthTable } from "./SectionHealthTable";
import { IncidentTable } from "./IncidentTable";
import { AlertRuleTable } from "./AlertRuleTable";
import { AlertEventTable } from "./AlertEventTable";
import { MonitoringTimeline } from "./MonitoringTimeline";
import { OpsKnowledgeRecommendationPanel } from "@/components/admin/ops-knowledge/OpsKnowledgeRecommendationPanel";
import { loadFullRecommendationAdminState } from "@/lib/recommendation-ops/recommendation-ops-sync-client";

type TabId = "dashboard" | "sections" | "incidents" | "rules" | "events";

const MONITORING_TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "dashboard", labelKey: "admin_rec_mon_tab_dashboard" },
  { id: "sections", labelKey: "admin_rec_mon_tab_sections" },
  { id: "incidents", labelKey: "admin_rec_mon_tab_incidents" },
  { id: "rules", labelKey: "admin_rec_mon_tab_rules" },
  { id: "events", labelKey: "admin_rec_mon_tab_events" },
];

export function AdminRecommendationMonitoringPage() {
  const { t } = useI18n();
  /** 탭은 주소 `?tab=` 보존 — 목록 필터와 함께 새로고침·링크 공유 시 유지 (R7). */
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const raw = searchParams?.get("tab") ?? "";
    return MONITORING_TABS.some((tab) => tab.id === raw) ? (raw as TabId) : "dashboard";
  });
  const { state: loadState, reload } = useAdminSyncLoad(loadFullRecommendationAdminState);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_menu_rec_monitoring"
          descriptionKey="admin_rec_mon_page_desc"
        />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_menu_rec_monitoring"
        descriptionKey="admin_rec_mon_page_desc_db"
      />
      <AdminTabs
        tabs={MONITORING_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="추천 모니터링 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        defaultValue="dashboard"
        resetParams={["page", "status", "surface"]}
        className="mb-4"
      />
      {activeTab === "dashboard" && (
        <>
          <div className="mb-4">
            <HealthSummaryCards />
          </div>
          <AdminCard titleKey="admin_rec_mon_card_timeline" className="mb-4">
            <MonitoringTimeline />
          </AdminCard>
          <AdminCard titleKey="admin_rec_mon_card_surface_health">
            <SurfaceHealthTable />
          </AdminCard>
        </>
      )}
      {activeTab === "sections" && (
        <AdminCard titleKey="admin_rec_mon_card_section_status">
          <SectionHealthTable />
        </AdminCard>
      )}
      {activeTab === "incidents" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,280px]">
          <AdminCard titleKey="admin_rec_mon_card_incidents">
            <IncidentTable />
          </AdminCard>
          <OpsKnowledgeRecommendationPanel
            sourceType="incident"
            sourceId={null}
            title={t("admin_rec_mon_card_incident_docs")}
            compact
          />
        </div>
      )}
      {activeTab === "rules" && (
        <AdminCard titleKey="admin_rec_mon_card_alert_rules">
          <AlertRuleTable />
        </AdminCard>
      )}
      {activeTab === "events" && (
        <AdminCard titleKey="admin_rec_mon_card_alert_events">
          <AlertEventTable />
        </AdminCard>
      )}
    </>
  );
}
