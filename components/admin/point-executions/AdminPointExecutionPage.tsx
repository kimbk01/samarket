"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { useAdminPointExecutionData } from "@/hooks/useAdminPointExecutionData";
import {
  filterPointRewardExecutions,
  type AdminPointExecutionFilters,
} from "@/lib/point-executions/point-execution-utils";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";
import { AdminPointExecutionFilterBar } from "./AdminPointExecutionFilterBar";
import { AdminPointExecutionTable } from "./AdminPointExecutionTable";
import { PointReclaimPolicyTable } from "./PointReclaimPolicyTable";
import { PointRewardLogList } from "./PointRewardLogList";

type TabId = "executions" | "reclaim" | "logs";

type PendingRewardGrant = {
  boardKey: string;
  actionType: "write" | "comment";
  targetId: string;
  targetType: "post" | "comment";
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
  reason: string;
  /** 정책 미리보기 지급액 (잔액 0 기준 = 실제 지급 상한) */
  previewPoint: number;
};

const DEFAULT_FILTERS: AdminPointExecutionFilters = {
  status: "",
  boardKey: "",
  actionType: "",
  userId: "",
};

export function AdminPointExecutionPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const tabs: { id: TabId; label: string }[] = [
    { id: "executions", label: t("admin_points_exec_tab_executions") },
    { id: "reclaim", label: t("admin_points_exec_tab_reclaim") },
    { id: "logs", label: t("admin_points_exec_tab_logs") },
  ];
  const [activeTab, setActiveTab] = useState<TabId>("executions");
  const [filters, setFilters] = useState<AdminPointExecutionFilters>(DEFAULT_FILTERS);
  const [refresh, setRefresh] = useState(0);
  const [pendingGrant, setPendingGrant] = useState<PendingRewardGrant | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  const { executions, reclaimPolicies, rewardLogs } = useAdminPointExecutionData(refresh);
  const filteredExecutions = useMemo(
    () => filterPointRewardExecutions(executions, filters),
    [executions, filters]
  );

  /**
   * V3-07: 실제 포인트가 지급된다 — 사유(2자 이상) 입력 → 정책 미리보기로 지급액 확인 →
   * 확인창에서 「닉네임 지급액」 을 다시 입력해야 POST.
   */
  const handleTestExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantMsg(null);
    const form = e.target as HTMLFormElement;
    const boardKey = (form.querySelector('[name="boardKey"]') as HTMLSelectElement)?.value ?? "general";
    const actionType = ((form.querySelector('[name="actionType"]') as HTMLSelectElement)?.value ?? "write") as "write" | "comment";
    const targetId = (form.querySelector('[name="targetId"]') as HTMLInputElement)?.value ?? "post-test-1";
    const targetType = ((form.querySelector('[name="targetType"]') as HTMLSelectElement)?.value ?? "post") as "post" | "comment";
    const userId = (form.querySelector('[name="userId"]') as HTMLInputElement)?.value ?? "me";
    const userNickname = ((form.querySelector('[name="userNickname"]') as HTMLInputElement)?.value ?? "").trim();
    const userType = ((form.querySelector('[name="userType"]') as HTMLSelectElement)?.value ?? "free") as "free" | "premium";
    const reason = ((form.querySelector('[name="reason"]') as HTMLInputElement)?.value ?? "").trim();
    if (reason.length < 2) {
      setGrantMsg(ko ? "지급 사유를 2자 이상 입력하세요." : "Enter a reason (2+ characters).");
      return;
    }
    if (!userNickname) {
      setGrantMsg(ko ? "대상 닉네임을 입력하세요." : "Enter the target nickname.");
      return;
    }
    // 정책 미리보기 (잔액 0 기준 — 무상 한도 적용 전이라 실제 지급액의 상한)
    const simRes = await adminFetch("/api/admin/point-policies/simulate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardKey, actionType, userType, currentPointBalance: 0 }),
    });
    const simJson = (await simRes.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      result?: { rewardPoint?: number } | null;
    };
    if (!simRes.ok || !simJson.ok) {
      setGrantMsg(adminOperatorErrorMessage(simJson.error || "db_error", ko));
      return;
    }
    const previewPoint = Math.max(0, Math.trunc(Number(simJson.result?.rewardPoint ?? 0)));
    if (previewPoint < 1) {
      setGrantMsg(ko ? "현재 정책으로는 지급할 포인트가 없습니다." : "The current policy grants 0 points.");
      return;
    }
    setPendingGrant({
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
      reason,
      previewPoint,
    });
  };

  const confirmGrant = async () => {
    if (!pendingGrant) return;
    setGrantBusy(true);
    try {
      const { previewPoint, ...rest } = pendingGrant;
      const res = await adminFetch("/api/admin/point-executions/reward", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, confirmedPoint: previewPoint }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        execution?: { status?: string; finalPoint?: number; reason?: string } | null;
      };
      if (!res.ok || !json.ok) {
        setGrantMsg(adminOperatorErrorMessage(json.error || "db_error", ko));
        return;
      }
      const ex = json.execution;
      setGrantMsg(
        ex?.status === "success"
          ? ko
            ? `실지급 완료: ${pendingGrant.userNickname} +${ex.finalPoint ?? 0}P`
            : `Granted: ${pendingGrant.userNickname} +${ex.finalPoint ?? 0}P`
          : ko
            ? `지급되지 않음: ${ex?.reason ?? "차단"}`
            : `Not granted: ${ex?.reason ?? "blocked"}`
      );
      setPendingGrant(null);
      setRefresh((r) => r + 1);
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_execute" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {tabs.map((tab) => (
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

      {activeTab === "executions" && (
        <>
          <AdminCard titleKey="admin_points_exec_card_test">
            <form onSubmit={handleTestExecute} className="flex flex-wrap items-end gap-2 sam-text-body">
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_th_board")}</label>
                <select name="boardKey" className="rounded border border-sam-border px-2 py-1.5" defaultValue="general">
                  {BOARD_OPTIONS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {pointBoardLabel(t, b.key)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_th_action")}</label>
                <select name="actionType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="write">
                  <option value="write">{t("admin_points_policy_th_write")}</option>
                  <option value="comment">{t("admin_points_policy_th_comment")}</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_exec_label_target_id")}</label>
                <input name="targetId" type="text" className="w-28 rounded border border-sam-border px-2 py-1.5" defaultValue="post-test-1" />
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_exec_label_target_type")}</label>
                <select name="targetType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="post">
                  <option value="post">{t("admin_points_target_post")}</option>
                  <option value="comment">{t("admin_points_policy_th_comment")}</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_ph_user_id")}</label>
                <input name="userId" type="text" className="w-24 rounded border border-sam-border px-2 py-1.5" defaultValue="me" />
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">{t("admin_points_exec_label_nickname")}</label>
                <input
                  name="userNickname"
                  type="text"
                  className="w-24 rounded border border-sam-border px-2 py-1.5"
                  defaultValue={t("admin_points_test_nickname")}
                />
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">
                  {t("admin_points_th_user")} {t("admin_points_th_type")}
                </label>
                <select name="userType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="free">
                  <option value="free">{pointUserTypeLabel(t, "free")}</option>
                  <option value="premium">{pointUserTypeLabel(t, "premium")}</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block sam-text-helper text-sam-muted">
                  {ko ? "지급 사유 (필수)" : "Reason (required)"}
                </label>
                <input
                  name="reason"
                  type="text"
                  required
                  minLength={2}
                  maxLength={300}
                  className="w-48 rounded border border-sam-border px-2 py-1.5"
                />
              </div>
              <button type="submit" className="rounded border border-signature bg-signature px-3 py-1.5 sam-text-body-secondary font-medium text-white">
                {ko ? "실지급 실행" : "Grant (real points)"}
              </button>
            </form>
            <p className="mt-2 sam-text-helper text-sam-muted">
              {ko
                ? "시험용이 아닙니다 — 대상 회원에게 실제 포인트가 지급되고 원장에 기록됩니다."
                : "Not a dry run — real points are credited to the member and recorded in the ledger."}
            </p>
            {grantMsg ? <p className="mt-1 sam-text-body text-sam-fg">{grantMsg}</p> : null}
            <AdminActionConfirmDialog
              open={pendingGrant != null}
              title={ko ? "포인트 실지급" : "Grant real points"}
              description={
                pendingGrant
                  ? ko
                    ? `${pendingGrant.userNickname} (${pendingGrant.userId}) 에게 최대 ${pendingGrant.previewPoint}P 가 실제로 지급됩니다. 사유: ${pendingGrant.reason}`
                    : `Up to ${pendingGrant.previewPoint}P will actually be credited to ${pendingGrant.userNickname} (${pendingGrant.userId}). Reason: ${pendingGrant.reason}`
                  : ""
              }
              confirmLabel={ko ? "실지급" : "Grant"}
              cancelLabel={ko ? "취소" : "Cancel"}
              tone="danger"
              confirmMatchText={pendingGrant ? `${pendingGrant.userNickname} ${pendingGrant.previewPoint}` : ""}
              confirmMatchLabel={
                pendingGrant
                  ? ko
                    ? `확인을 위해 대상 닉네임과 지급액 「${pendingGrant.userNickname} ${pendingGrant.previewPoint}」 를 입력하세요`
                    : `Type the nickname and amount 「${pendingGrant.userNickname} ${pendingGrant.previewPoint}」 to confirm`
                  : undefined
              }
              pending={grantBusy}
              onCancel={() => setPendingGrant(null)}
              onConfirm={() => void confirmGrant()}
            />
          </AdminCard>
          <AdminCard titleKey="admin_points_exec_card_history">
            <div className="mb-3">
              <AdminPointExecutionFilterBar
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>
          <AdminPointExecutionTable executions={filteredExecutions} />
          </AdminCard>
        </>
      )}

      {activeTab === "reclaim" && (
        <AdminCard titleKey="admin_points_exec_card_reclaim">
          <PointReclaimPolicyTable
            policies={reclaimPolicies}
            onToggleActive={async (p) => {
              await adminFetch(`/api/admin/point-executions/reclaim/${p.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !p.isActive }),
              });
              setRefresh((r) => r + 1);
            }}
          />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard titleKey="admin_points_exec_card_logs">
          <PointRewardLogList logs={rewardLogs} />
        </AdminCard>
      )}
    </div>
  );
}
