"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AutomationSummaryCards } from "./AutomationSummaryCards";
import { AutomationPolicyTable } from "./AutomationPolicyTable";
import { EscalationRuleTable } from "./EscalationRuleTable";
import { AutomationExecutionTable } from "./AutomationExecutionTable";
import { RecoveryStateTable } from "./RecoveryStateTable";
import { AutomationSimulator } from "./AutomationSimulator";
import { loadFullRecommendationAdminState } from "@/lib/recommendation-ops/recommendation-ops-sync-client";

type TabId = "policy" | "escalation" | "executions" | "recovery" | "simulator";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "자동화 정책" },
  { id: "escalation", label: "Escalation 규칙" },
  { id: "executions", label: "자동 조치 실행" },
  { id: "recovery", label: "Recovery 상태" },
  { id: "simulator", label: "시뮬레이션" },
];

export function AdminRecommendationAutomationPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadFullRecommendationAdminState().then((r) => {
      if (!r.ok) setHydrateError(r.errors?.join(" · ") ?? "불러오기 실패");
      setHydrated(true);
    });
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader
          title="추천 운영 자동화"
          description="임계치 기반 자동 Fallback·롤백·Escalation·Dry-run"
        />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">운영 설정을 불러오는 중…</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="추천 운영 자동화"
        description="임계치 기반 자동 Fallback·롤백·Escalation·Dry-run — 정책·규칙·실행 이력은 DB(admin_settings)에 저장됩니다."
      />
      {hydrateError && (
        <div
          className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          서버에서 추천 운영 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({hydrateError})
        </div>
      )}
      <div className="mb-4">
        <AutomationSummaryCards />
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
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
