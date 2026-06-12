"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const { t } = useI18n();
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
        <AdminPageHeader titleKey="admin_qa_kdcc4b43a" />
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
      <AdminPageHeader titleKey="admin_qa_kdcc4b43a" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
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
            {tab.label}
          </button>
        ))}
      </div>

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
