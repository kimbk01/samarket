"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { PersonalizedFeedLog, PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PersonalizedPolicyTable } from "./PersonalizedPolicyTable";
import { PersonalizedPolicyForm } from "./PersonalizedPolicyForm";
import { PersonalizedFeedSimulator } from "./PersonalizedFeedSimulator";
import { PersonalizedFeedLogList } from "./PersonalizedFeedLogList";

type TabId = "policy" | "simulate" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "policy", label: "개인화 정책" },
  { id: "simulate", label: "추천 시뮬레이션" },
  { id: "logs", label: "생성 로그" },
];

export function AdminPersonalizedFeedPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [policies, setPolicies] = useState<PersonalizedFeedPolicy[]>([]);
  const [logs, setLogs] = useState<PersonalizedFeedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/personalized-feed-policies", {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        bundle?: { policies?: PersonalizedFeedPolicy[]; logs?: PersonalizedFeedLog[] };
      };
      setPolicies(j.bundle?.policies ?? []);
      setLogs(j.bundle?.logs ?? []);
    } catch {
      setPolicies([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editingPolicy = editingPolicyId ? policies.find((p) => p.id === editingPolicyId) : null;

  const handleSavePolicy = async (values: Partial<PersonalizedFeedPolicy>) => {
    if (!editingPolicy) return;
    const res = await fetch("/api/admin/personalized-feed-policies", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: { ...editingPolicy, ...values } }),
    });
    if (res.ok) {
      setEditingPolicyId(null);
      void load();
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_personalized_feed_kba737687" />

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
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? <p className="sam-text-body text-sam-muted">{t("common_loading")}</p> : null}

      {activeTab === "policy" && !loading && (
        <AdminCard titleKey="admin_personalized_feed_k72af229f">
          {editingPolicy && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <PersonalizedPolicyForm
                initial={editingPolicy}
                onSubmit={(v) => void handleSavePolicy(v)}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          <PersonalizedPolicyTable
            policies={policies}
            onEdit={(p) => setEditingPolicyId(editingPolicyId === p.id ? null : p.id)}
          />
        </AdminCard>
      )}

      {activeTab === "simulate" && !loading && (
        <AdminCard titleKey="admin_personalized_feed_k42182c5c">
          <PersonalizedFeedSimulator policies={policies} />
        </AdminCard>
      )}

      {activeTab === "logs" && !loading && (
        <AdminCard titleKey="admin_personalized_feed_create_4">
          <PersonalizedFeedLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
