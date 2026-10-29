"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
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
  const { t, language } = useI18n();
  const ko = language !== "en";
  // IA-02/J-6: 정책 저장 = 최고관리자 전용 (서버 requireSuperAdmin) — 조회는 전원
  const writeAction = useAdminRouteAction("/admin/exposure-policies");
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [policies, setPolicies] = useState<ExposureScorePolicy[]>([]);
  const [logs, setLogs] = useState<ExposurePolicyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  /** 불러오기 실패 — 표준 오류 상태 (저장 오류 `err` 와 분리) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/exposure-policies", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        policies?: ExposureScorePolicy[];
        logs?: ExposurePolicyLog[];
      };
      if (!res.ok || !j.ok) {
        setLoadErr({ code: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setLoadErr(null);
      setPolicies(j.policies ?? []);
      setLogs(j.logs ?? []);
    } catch {
      setLoadErr({ code: "network_error" });
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
    // 정책 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "노출 정책 저장" : "Save exposure policy",
      description: t("admin_feed_policy_unlinked_notice"),
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setErr("");
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
      {/* N-02: 고객 앱 연결 미확인 정책 — 닫을 수 없는 안내 */}
      <div
        role="note"
        data-admin-feed-policy-unlinked="1"
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg"
      >
        {t("admin_feed_policy_unlinked_notice")}
      </div>

      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
      />

      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}
      {loading ? <AdminLoadingState ko={ko} label={t("common_loading")} /> : null}
      {!loading && loadErr && activeTab !== "simulate" ? (
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />
      ) : null}

      {activeTab === "policy" && !loading && !loadErr && (
        <AdminCard titleKey="admin_exposure_k6d95f114">
          {editingPolicy && writeAction.allowed && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <ExposurePolicyForm
                initial={editingPolicy}
                onSubmit={(v) => void handleSavePolicy(v)}
                onCancel={() => setEditingPolicyId(null)}
              />
            </div>
          )}
          {!writeAction.allowed && writeAction.reason ? (
            <p className="mb-2 text-xs text-sam-muted" data-admin-action-denied="1">
              수정 비활성: {writeAction.reason}
            </p>
          ) : null}
          <ExposurePolicyTable
            policies={policies}
            onEdit={
              writeAction.allowed
                ? (p) => setEditingPolicyId(editingPolicyId === p.id ? null : p.id)
                : undefined
            }
          />
        </AdminCard>
      )}

      {activeTab === "simulate" && (
        <AdminCard titleKey="admin_exposure_k6349265b">
          <ExposureSimulator onSimulated={() => void load()} />
        </AdminCard>
      )}

      {activeTab === "logs" && !loading && !loadErr && (
        <AdminCard titleKey="admin_exposure_k14bf3e5b">
          <ExposurePolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
