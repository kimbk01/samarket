"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { state: loadState, reload } = useAdminSyncLoad(loadProductionMigrationFromServer);
  const hydrated = loadState.status === "ready";

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
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
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
