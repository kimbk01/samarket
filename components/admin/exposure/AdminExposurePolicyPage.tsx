"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getExposureScorePolicies } from "@/lib/exposure/mock-exposure-score-policies";
import { saveExposureScorePolicy } from "@/lib/exposure/mock-exposure-score-policies";
import { getExposurePolicyLogs } from "@/lib/exposure/mock-exposure-policy-logs";
import { ExposurePolicyTable } from "./ExposurePolicyTable";
import { ExposurePolicyForm } from "./ExposurePolicyForm";
import { ExposureSimulator } from "./ExposureSimulator";
import { ExposurePolicyLogList } from "./ExposurePolicyLogList";

type TabId = "policy" | "simulate" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "정책" },
  { id: "simulate", label: "시뮬레이션" },
  { id: "logs", label: "변경 이력" },
];

export function AdminExposurePolicyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [refresh, setRefresh] = useState(0);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const policies = useMemo(
    () => getExposureScorePolicies(),
    [refresh]
  );
  const logs = useMemo(() => getExposurePolicyLogs(), [refresh]);
  const editingPolicy = useMemo(
    () => (editingPolicyId ? policies.find((p) => p.id === editingPolicyId) : null),
    [editingPolicyId, policies]
  );

  const handleSavePolicy = (values: Partial<typeof editingPolicy>) => {
    if (!editingPolicy) return;
    saveExposureScorePolicy({ ...editingPolicy, ...values });
    setRefresh((r) => r + 1);
    setEditingPolicyId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="노출 점수 정책" />

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === t.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "policy" && (
        <AdminCard title="노출 점수 정책 (surface별 가중치)">
          {editingPolicy && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
              <ExposurePolicyForm
                initial={editingPolicy}
                onSubmit={handleSavePolicy}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          <ExposurePolicyTable
            policies={policies}
            onEdit={(p) => setEditingPolicyId(editingPolicyId === p.id ? null : p.id)}
          />
        </AdminCard>
      )}

      {activeTab === "simulate" && (
        <AdminCard title="시뮬레이션">
          <ExposureSimulator onSimulated={() => setRefresh((r) => r + 1)} />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard title="변경 이력">
          <ExposurePolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
