"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { BackupSnapshotTable } from "./BackupSnapshotTable";
import { RestoreSimulationCard } from "./RestoreSimulationCard";

type TabId = "list" | "restore";

const TABS: { id: TabId; label: string }[] = [
  { id: "list", label: "백업 목록" },
  { id: "restore", label: "복구 시뮬레이션" },
];

export function AdminBackupPage() {
  const [activeTab, setActiveTab] = useState<TabId>("list");

  return (
    <>
      <AdminPageHeader title="백업 / 복구" />
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
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-signature bg-signature/10 px-3 py-2 text-[14px] font-medium text-signature hover:bg-signature/20"
            >
              백업 실행 (mock)
            </button>
            <span className="text-[12px] text-sam-muted">
              manual / scheduled / pre-release / emergency
            </span>
          </div>
          <AdminCard title="백업 스냅샷">
            <BackupSnapshotTable />
          </AdminCard>
        </div>
      )}
      {activeTab === "restore" && (
        <AdminCard title="복구 시뮬레이션 및 실행 로그">
          <RestoreSimulationCard />
        </AdminCard>
      )}
    </>
  );
}
