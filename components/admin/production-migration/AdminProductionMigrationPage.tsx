"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { ProductionMigrationSummaryCards } from "./ProductionMigrationSummaryCards";
import { ProductionMigrationTable } from "./ProductionMigrationTable";
import { ProductionRlsCheckTable } from "./ProductionRlsCheckTable";
import { ProductionInfraCheckTable } from "./ProductionInfraCheckTable";
import { ProductionLaunchCheckTable } from "./ProductionLaunchCheckTable";
import { ProductionBlockerBoard } from "./ProductionBlockerBoard";
import { loadProductionMigrationFromServer } from "@/lib/production-migration/production-migration-sync-client";

type TabId =
  | "overview"
  | "table"
  | "rls"
  | "infra"
  | "launch"
  | "blocker";

export function AdminProductionMigrationPage() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadProductionMigrationFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Migration 개요" },
    { id: "table", label: "테이블 상태" },
    { id: "rls", label: "RLS 점검" },
    { id: "infra", label: "인프라 점검" },
    { id: "launch", label: "Cutover 체크리스트" },
    { id: "blocker", label: "Blocker 보드" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_production" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_production" />
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />

      {activeTab === "overview" && (
        <AdminCard titleKey="admin_prod_migration_summary_deploy_2">
          <ProductionMigrationSummaryCards />
        </AdminCard>
      )}

      {activeTab === "table" && (
        <AdminCard titleKey="admin_prod_migration_k92baf5c0">
          <ProductionMigrationTable />
        </AdminCard>
      )}

      {activeTab === "rls" && (
        <AdminCard titleKey="admin_prod_migration_k45e42f6f">
          <ProductionRlsCheckTable />
        </AdminCard>
      )}

      {activeTab === "infra" && (
        <AdminCard titleKey="admin_prod_migration_k1dc78488">
          <ProductionInfraCheckTable />
        </AdminCard>
      )}

      {activeTab === "launch" && (
        <AdminCard titleKey="admin_prod_migration_checklist_deploy_3">
          <ProductionLaunchCheckTable />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_launch_readiness_kead0bf4e">
          <ProductionBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
