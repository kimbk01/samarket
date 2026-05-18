"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadFullRecommendationAdminState().then((r) => {
      if (!r.ok) setHydrateError(r.errors?.join(" · ") ?? t("admin_rec_load_failed"));
      setHydrated(true);
    });
  }, [t]);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          titleKey="admin_rec_mon_page_title"
          descriptionKey="admin_rec_mon_page_desc"
        />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_mon_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_rec_mon_page_title"
        descriptionKey="admin_rec_mon_page_desc_db"
      />
      {hydrateError ? (
        <div className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body-secondary text-sam-fg" role="alert">
          {t("admin_rec_mon_hydrate_fail")} ({hydrateError})
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {MONITORING_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
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
