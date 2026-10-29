"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminCard } from "@/components/admin/AdminCard";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminErrorState, AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";
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
  const { t, language } = useI18n();
  const ko = language !== "en";
  // IA-02/J-6: 정책 저장 = 최고관리자 전용 (서버 requireSuperAdmin) — 조회는 전원
  const writeAction = useAdminRouteAction("/admin/home-feed");
  const [activeTab, setActiveTab] = useState<TabId>("policy");
  const [policies, setPolicies] = useState<HomeFeedPolicy[]>([]);
  const [logs, setLogs] = useState<HomeFeedGenerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  /** 불러오기 실패 — 표준 오류 상태 (빈 목록으로 숨기지 않는다) */
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/home-feed-policies", {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        bundle?: { policies?: HomeFeedPolicy[]; generationLogs?: HomeFeedGenerationLog[] };
      };
      if (!res.ok || !j.ok) {
        setLoadErr({ code: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status });
        return;
      }
      setLoadErr(null);
      setPolicies(j.bundle?.policies ?? []);
      setLogs(j.bundle?.generationLogs ?? []);
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

  const handleSavePolicy = async (values: Partial<HomeFeedPolicy>) => {
    if (!editingPolicy) return;
    // 정책 저장 = L1 확인 (표준 확인창)
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "홈 피드 정책 저장" : "Save home feed policy",
      description: t("admin_feed_policy_unlinked_notice"),
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setSaveResult(null);
    const res = await fetch("/api/admin/home-feed-policies", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: { ...editingPolicy, ...values } }),
    });
    if (res.ok) {
      setEditingPolicyId(null);
      setSaveResult({ ok: true, message: ko ? "저장했습니다." : "Saved." });
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveResult({ ok: false, code: res.status === 403 ? "forbidden" : adminSafeErrorCode(j.error, "save_failed") });
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_home_feed_home_2" />
      {/* N-02: 고객 앱 연결 미확인 정책 — 닫을 수 없는 안내 */}
      <div
        role="note"
        data-admin-feed-policy-unlinked="1"
        className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg"
      >
        {t("admin_feed_policy_unlinked_notice")}
      </div>

      <AdminTabs
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />

      <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
      {loading ? <AdminLoadingState ko={ko} label={t("common_loading")} /> : null}
      {!loading && loadErr ? (
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} />
      ) : null}

      {activeTab === "policy" && !loading && !loadErr && (
        <AdminCard titleKey="admin_home_feed_active_2">
          {editingPolicy && writeAction.allowed && (
            <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
              <HomeFeedPolicyForm
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
          <HomeFeedPolicyTable
            policies={policies}
            onEdit={
              writeAction.allowed
                ? (p) => setEditingPolicyId(editingPolicyId === p.id ? null : p.id)
                : undefined
            }
          />
        </AdminCard>
      )}

      {activeTab === "preview" && !loading && !loadErr && <HomeFeedPreview policies={policies} />}
      {activeTab === "logs" && !loading && !loadErr && <HomeFeedGenerationLogList logs={logs} />}
    </div>
  );
}
