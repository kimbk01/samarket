"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRoutineSummaryCards } from "./OpsRoutineSummaryCards";
import { OpsRoutineTemplateTable } from "./OpsRoutineTemplateTable";
import { OpsRoutineExecutionTable } from "./OpsRoutineExecutionTable";
import { OpsCarryOverBoard } from "./OpsCarryOverBoard";
import { OpsMonthlyNoteList } from "./OpsMonthlyNoteList";
import { OpsOperationalizationStatusCard } from "./OpsOperationalizationStatusCard";

type TabId =
  | "overview"
  | "recurring"
  | "monthly-note"
  | "operationalization"
  | "carry-over";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "루틴 요약" },
  { id: "recurring", label: "반복 작업" },
  { id: "monthly-note", label: "월간 메모" },
  { id: "operationalization", label: "정착 상태" },
  { id: "carry-over", label: "이월 보드" },
];

export function AdminOpsRoutinesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <>
      <AdminPageHeader title="장기 운영 / 월간 루틴" />
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
      {activeTab === "overview" && (
        <AdminCard title="루틴 요약">
          <OpsRoutineSummaryCards />
        </AdminCard>
      )}
      {activeTab === "recurring" && (
        <div className="space-y-4">
          <AdminCard title="루틴 템플릿">
            <OpsRoutineTemplateTable />
          </AdminCard>
          <AdminCard title="실행 항목 (주간/월간/분기)">
            <OpsRoutineExecutionTable />
          </AdminCard>
        </div>
      )}
      {activeTab === "monthly-note" && (
        <AdminCard title="월간 운영 메모">
          <OpsMonthlyNoteList />
        </AdminCard>
      )}
      {activeTab === "operationalization" && (
        <AdminCard title="운영 체계 정착 상태">
          <OpsOperationalizationStatusCard />
        </AdminCard>
      )}
      {activeTab === "carry-over" && (
        <AdminCard title="이월 보드">
          <OpsCarryOverBoard />
        </AdminCard>
      )}
    </>
  );
}
