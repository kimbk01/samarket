"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ProductionMigrationSummaryCards } from "./ProductionMigrationSummaryCards";
import { ProductionMigrationTable } from "./ProductionMigrationTable";
import { ProductionRlsCheckTable } from "./ProductionRlsCheckTable";
import { ProductionInfraCheckTable } from "./ProductionInfraCheckTable";
import { ProductionLaunchCheckTable } from "./ProductionLaunchCheckTable";
import { ProductionBlockerBoard } from "./ProductionBlockerBoard";

type TabId =
  | "overview"
  | "table"
  | "rls"
  | "infra"
  | "launch"
  | "blocker";

export function AdminProductionMigrationPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Migration 개요" },
    { id: "table", label: "테이블 상태" },
    { id: "rls", label: "RLS 점검" },
    { id: "infra", label: "인프라 점검" },
    { id: "launch", label: "Cutover 체크리스트" },
    { id: "blocker", label: "Blocker 보드" },
  ];

  return (
    <>
      <AdminPageHeader title="프로덕션 전환" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
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

      {activeTab === "overview" && (
        <AdminCard title="Readiness 요약 · 테이블/RLS/인프라/배포 체크">
          <ProductionMigrationSummaryCards />
        </AdminCard>
      )}

      {activeTab === "table" && (
        <AdminCard title="실제 연동 대상 테이블 · Supabase 스키마 맵">
          <ProductionMigrationTable />
        </AdminCard>
      )}

      {activeTab === "rls" && (
        <AdminCard title="RLS 정책 점검">
          <ProductionRlsCheckTable />
        </AdminCard>
      )}

      {activeTab === "infra" && (
        <AdminCard title="스토리지/Env/Webhook 등 인프라 점검">
          <ProductionInfraCheckTable />
        </AdminCard>
      )}

      {activeTab === "launch" && (
        <AdminCard title="최종 배포 전환 체크리스트 (SQL 적용 placeholder)">
          <ProductionLaunchCheckTable />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard title="Blocker 집중 보드">
          <ProductionBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
