"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { ExposurePolicyLog, ExposureScorePolicy } from "@/lib/types/exposure";
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
  const [policies, setPolicies] = useState<ExposureScorePolicy[]>([]);
  const [logs, setLogs] = useState<ExposurePolicyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/exposure-policies", { cache: "no-store", credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        policies?: ExposureScorePolicy[];
        logs?: ExposurePolicyLog[];
      };
      if (j.ok) {
        setPolicies(j.policies ?? []);
        setLogs(j.logs ?? []);
      }
    } catch {
      setErr("노출 정책을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editingPolicy = editingPolicyId ? policies.find((p) => p.id === editingPolicyId) : null;

  const handleSavePolicy = async (values: Partial<ExposureScorePolicy>) => {
    if (!editingPolicy) return;
    const res = await fetch(`/api/admin/exposure-policies/${encodeURIComponent(editingPolicy.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setErr("정책 저장에 실패했습니다.");
      return;
    }
    setEditingPolicyId(null);
    await load();
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

      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}
      {loading ? <p className="sam-text-body text-sam-muted">{t("common_loading")}</p> : null}

      {activeTab === "policy" && !loading && (
        <AdminCard titleKey="admin_exposure_k6d95f114">
          {editingPolicy && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <ExposurePolicyForm
                initial={editingPolicy}
                onSubmit={(v) => void handleSavePolicy(v)}
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
          <ExposureSimulator onSimulated={() => void load()} />
        </AdminCard>
      )}

      {activeTab === "logs" && !loading && (
        <AdminCard titleKey="admin_exposure_k14bf3e5b">
          <ExposurePolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
