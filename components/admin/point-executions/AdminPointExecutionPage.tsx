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
import { getPointRewardExecutions } from "@/lib/point-executions/mock-point-reward-executions";
import { getPointReclaimPolicies } from "@/lib/point-executions/mock-point-reclaim-policies";
import { getPointRewardLogs } from "@/lib/point-executions/mock-point-reward-logs";
import { executePointReward } from "@/lib/point-executions/execute-point-reward";
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

const DEFAULT_FILTERS: AdminPointExecutionFilters = {
  status: "",
  boardKey: "",
  actionType: "",
  userId: "",
};

export function AdminPointExecutionPage() {
  const { t } = useI18n();
  const tabs: { id: TabId; label: string }[] = [
    { id: "executions", label: t("admin_points_exec_tab_executions") },
    { id: "reclaim", label: t("admin_points_exec_tab_reclaim") },
    { id: "logs", label: t("admin_points_exec_tab_logs") },
  ];
  const [activeTab, setActiveTab] = useState<TabId>("executions");
  const [filters, setFilters] = useState<AdminPointExecutionFilters>(DEFAULT_FILTERS);
  const [refresh, setRefresh] = useState(0);

  const executions = useMemo(() => getPointRewardExecutions(), [refresh]);
  const filteredExecutions = useMemo(
    () => filterPointRewardExecutions(executions, filters),
    [executions, filters]
  );
  const reclaimPolicies = useMemo(() => getPointReclaimPolicies(), []);
  const rewardLogs = useMemo(() => getPointRewardLogs(), [refresh]);

  const handleTestExecute = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const boardKey = (form.querySelector('[name="boardKey"]') as HTMLSelectElement)?.value ?? "general";
    const actionType = ((form.querySelector('[name="actionType"]') as HTMLSelectElement)?.value ?? "write") as "write" | "comment";
    const targetId = (form.querySelector('[name="targetId"]') as HTMLInputElement)?.value ?? "post-test-1";
    const targetType = ((form.querySelector('[name="targetType"]') as HTMLSelectElement)?.value ?? "post") as "post" | "comment";
    const userId = (form.querySelector('[name="userId"]') as HTMLInputElement)?.value ?? "me";
    const userNickname = (form.querySelector('[name="userNickname"]') as HTMLInputElement)?.value ?? t("admin_points_test_nickname");
    const userType = ((form.querySelector('[name="userType"]') as HTMLSelectElement)?.value ?? "free") as "free" | "premium";
    executePointReward({
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
    });
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_points_exec_page" />

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
              <button type="submit" className="rounded border border-signature bg-signature px-3 py-1.5 sam-text-body-secondary font-medium text-white"> {t("admin_points_btn_run")}
              </button>
            </form>
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
          <PointReclaimPolicyTable policies={reclaimPolicies} />
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
