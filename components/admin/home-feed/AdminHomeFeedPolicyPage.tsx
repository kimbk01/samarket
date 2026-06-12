"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { HomeFeedGenerationLog, HomeFeedPolicy } from "@/lib/types/home-feed";
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
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [policies, setPolicies] = useState<HomeFeedPolicy[]>([]);
  const [logs, setLogs] = useState<HomeFeedGenerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/home-feed-policies", {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        bundle?: { policies?: HomeFeedPolicy[]; generationLogs?: HomeFeedGenerationLog[] };
      };
      setPolicies(j.bundle?.policies ?? []);
      setLogs(j.bundle?.generationLogs ?? []);
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

  const handleSavePolicy = async (values: Partial<HomeFeedPolicy>) => {
    if (!editingPolicy) return;
    const res = await fetch("/api/admin/home-feed-policies", {
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
      <AdminPageHeader titleKey="admin_home_feed_home_2" />

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
        <AdminCard titleKey="admin_home_feed_active_2">
          {editingPolicy && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <HomeFeedPolicyForm
                initial={editingPolicy}
                onSubmit={(v) => void handleSavePolicy(v)}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          <HomeFeedPolicyTable
            policies={policies}
            onEdit={(p) => setEditingPolicyId(editingPolicyId === p.id ? null : p.id)}
          />
        </AdminCard>
      )}

      {activeTab === "preview" && !loading && <HomeFeedPreview policies={policies} />}
      {activeTab === "logs" && !loading && <HomeFeedGenerationLogList logs={logs} />}
    </div>
  );
}
