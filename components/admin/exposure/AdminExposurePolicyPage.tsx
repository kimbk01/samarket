"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "policy", labelKey: "admin_prod_migration_k9d7426d4" },
  { id: "simulate", labelKey: "admin_exposure_k6349265b" },
  { id: "logs", labelKey: "admin_exposure_k14bf3e5b" },
];

export function AdminExposurePolicyPage() {
  const { t } = useI18n();
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
      <AdminPageHeader titleKey="admin_exposure_k3ec2b019" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "policy" && (
        <AdminCard titleKey="admin_exposure_k6d95f114">
          {editingPolicy && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
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
        <AdminCard titleKey="admin_exposure_k6349265b">
          <ExposureSimulator onSimulated={() => setRefresh((r) => r + 1)} />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard titleKey="admin_exposure_k14bf3e5b">
          <ExposurePolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
