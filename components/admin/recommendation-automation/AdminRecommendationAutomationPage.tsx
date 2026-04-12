"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationSummaryCards } from "./AutomationSummaryCards";
import { AutomationPolicyTable } from "./AutomationPolicyTable";
import { EscalationRuleTable } from "./EscalationRuleTable";
import { AutomationExecutionTable } from "./AutomationExecutionTable";
import { RecoveryStateTable } from "./RecoveryStateTable";
import { AutomationSimulator } from "./AutomationSimulator";

type TabId =
  | "policy"
  | "escalation"
  | "executions"
  | "recovery"
  | "simulator";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "자동화 정책" },
  { id: "escalation", label: "Escalation 규칙" },
  { id: "executions", label: "자동 조치 실행" },
  { id: "recovery", label: "Recovery 상태" },
  { id: "simulator", label: "시뮬레이션" },
];

export function AdminRecommendationAutomationPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");

  return (
    <>
      <AdminPageHeader
        title="추천 운영 자동화"
        description="임계치 기반 자동 Fallback·롤백·Escalation·Dry-run"
      />
      <div className="mb-4">
        <AutomationSummaryCards />
      </div>
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
      <AdminCard>
        {activeTab === "policy" && <AutomationPolicyTable />}
        {activeTab === "escalation" && <EscalationRuleTable />}
        {activeTab === "executions" && <AutomationExecutionTable />}
        {activeTab === "recovery" && <RecoveryStateTable />}
        {activeTab === "simulator" && <AutomationSimulator />}
      </AdminCard>
    </>
  );
}
