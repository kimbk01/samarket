"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getPersonalizedFeedPolicies, savePersonalizedFeedPolicy } from "@/lib/personalized-feed/mock-personalized-feed-policies";
import { getOrCreateBehaviorProfile } from "@/lib/personalized-feed/mock-user-behavior-profiles";
import { getPersonalizedFeedLogs } from "@/lib/personalized-feed/mock-personalized-feed-logs";
import { PersonalizedPolicyTable } from "./PersonalizedPolicyTable";
import { PersonalizedPolicyForm } from "./PersonalizedPolicyForm";
import { UserBehaviorProfileTable } from "./UserBehaviorProfileTable";
import { PersonalizedFeedSimulator } from "./PersonalizedFeedSimulator";
import { PersonalizedFeedLogList } from "./PersonalizedFeedLogList";

type TabId = "policy" | "profile" | "simulate" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "개인화 정책" },
  { id: "profile", label: "사용자 행동 프로필" },
  { id: "simulate", label: "추천 시뮬레이션" },
  { id: "logs", label: "생성 로그" },
];

const MOCK_USER_IDS = ["me"];

export function AdminPersonalizedFeedPage() {
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [refresh, setRefresh] = useState(0);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const policies = useMemo(() => getPersonalizedFeedPolicies(), [refresh]);
  const profiles = useMemo(
    () =>
      MOCK_USER_IDS.map((id) =>
        getOrCreateBehaviorProfile(id, "마닐라 · Malate · Barangay 1")
      ),
    [refresh]
  );
  const logs = useMemo(() => getPersonalizedFeedLogs(), [refresh]);
  const editingPolicy = useMemo(
    () => (editingPolicyId ? policies.find((p) => p.id === editingPolicyId) : null),
    [editingPolicyId, policies]
  );

  const handleSavePolicy = (values: Partial<NonNullable<typeof editingPolicy>>) => {
    if (!editingPolicy) return;
    savePersonalizedFeedPolicy({ ...editingPolicy, ...values });
    setRefresh((r) => r + 1);
    setEditingPolicyId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="개인화 추천 정책" />

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
        <AdminCard title="섹션별 개인화 정책">
          {editingPolicy && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
              <PersonalizedPolicyForm
                initial={editingPolicy}
                onSubmit={handleSavePolicy}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          <PersonalizedPolicyTable
            policies={policies}
            onEdit={(p) =>
              setEditingPolicyId(editingPolicyId === p.id ? null : p.id)
            }
          />
        </AdminCard>
      )}

      {activeTab === "profile" && (
        <AdminCard title="사용자 행동 프로필 (mock)">
          <UserBehaviorProfileTable profiles={profiles} />
        </AdminCard>
      )}

      {activeTab === "simulate" && (
        <AdminCard title="개인화 추천 시뮬레이션">
          <PersonalizedFeedSimulator />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard title="개인화 피드 생성 로그">
          <PersonalizedFeedLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
