"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getHomeFeedPolicies, saveHomeFeedPolicy } from "@/lib/home-feed/mock-home-feed-policies";
import { getHomeFeedGenerationLogs } from "@/lib/home-feed/mock-home-feed-generation-logs";
import { HomeFeedPolicyTable } from "./HomeFeedPolicyTable";
import { HomeFeedPolicyForm } from "./HomeFeedPolicyForm";
import { HomeFeedPreview } from "./HomeFeedPreview";
import { HomeFeedGenerationLogList } from "./HomeFeedGenerationLogList";

type TabId = "policy" | "preview" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "피드 정책" },
  { id: "preview", label: "결과 미리보기" },
  { id: "logs", label: "생성 로그" },
];

export function AdminHomeFeedPolicyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [refresh, setRefresh] = useState(0);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const policies = useMemo(() => getHomeFeedPolicies(), [refresh]);
  const logs = useMemo(() => getHomeFeedGenerationLogs(), [refresh]);
  const editingPolicy = useMemo(
    () => (editingPolicyId ? policies.find((p) => p.id === editingPolicyId) : null),
    [editingPolicyId, policies]
  );

  const handleSavePolicy = (values: Partial<NonNullable<typeof editingPolicy>>) => {
    if (!editingPolicy) return;
    saveHomeFeedPolicy({ ...editingPolicy, ...values });
    setRefresh((r) => r + 1);
    setEditingPolicyId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="홈 피드 정책" />

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
        <AdminCard title="섹션별 정책 (활성/정렬/최대 노출/지역범위)">
          {editingPolicy && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
              <HomeFeedPolicyForm
                initial={editingPolicy}
                onSubmit={handleSavePolicy}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          <HomeFeedPolicyTable
            policies={policies}
            onEdit={(p) =>
              setEditingPolicyId(editingPolicyId === p.id ? null : p.id)
            }
          />
        </AdminCard>
      )}

      {activeTab === "preview" && (
        <AdminCard title="피드 결과 미리보기">
          <HomeFeedPreview refreshKey={refresh} />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard title="피드 생성 로그">
          <HomeFeedGenerationLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
