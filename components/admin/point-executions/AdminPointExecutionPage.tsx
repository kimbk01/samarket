"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointBoardLabel, pointUserTypeLabel } from "@/components/admin/points/admin-points-notifications-i18n";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { useAdminPointExecutionData } from "@/hooks/useAdminPointExecutionData";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";
import type { PointReclaimPolicy } from "@/lib/types/point-execution";
import {
  AdminPointExecutionFilterBar,
  POINT_EXECUTION_FILTER_EXTRAS,
  POINT_EXECUTION_STATUSES,
} from "./AdminPointExecutionFilterBar";
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
  /** 정책 미리보기 지급액 (잔액 0 기준 = 실제 지급 상한) */
  previewPoint: number;
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
  const lq = useAdminListQuery({ statuses: POINT_EXECUTION_STATUSES, extras: POINT_EXECUTION_FILTER_EXTRAS });
  const action = useAdminRouteAction("/admin/point-executions");
  const [refresh, setRefresh] = useState(0);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [reclaimBusy, setReclaimBusy] = useState(false);
  const [reclaimResult, setReclaimResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );

  const { executions, total, reclaimPolicies, rewardLogs, loading, error } = useAdminPointExecutionData(
    `${lq.refreshKey}:${refresh}`,
    lq.apiQueryString
  );

  const toggleReclaim = async (p: PointReclaimPolicy) => {
    if (reclaimBusy || !action.allowed) return;
    const nextLabel = p.isActive ? t("admin_points_status_inactive") : t("admin_points_status_active");
    const c = await confirmAdminAction({
      level: adminActionLevel(p.isActive ? "disable" : "resume"),
      ko,
      title: ko ? "회수 정책 상태 변경" : "Change reclaim policy status",
      description: ko ? `이 회수 정책을 「${nextLabel}」 상태로 바꿉니다.` : `Set this reclaim policy to "${nextLabel}".`,
      confirmLabel: adminCta("save", ko),
    });
    if (!c.ok) return;
    setReclaimBusy(true);
    setReclaimResult(null);
    try {
      const res = await adminFetch(`/api/admin/point-executions/reclaim/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setReclaimResult({ ok: false, code: json.error ?? "update_failed" });
        return;
      }
      setReclaimResult({ ok: true, message: ko ? "저장했습니다." : "Saved." });
      setRefresh((r) => r + 1);
    } catch {
      setReclaimResult({ ok: false, code: "network_error" });
    } finally {
      setReclaimBusy(false);
    }
  };

  /**
   * V3-07: 실제 포인트가 지급된다 — 정책 미리보기로 지급액 확인 → 확인창(payout · L2)에서
   * 사유(2자 이상)를 받아 POST 본문 `reason` 으로 보낸다 (원장·감사 기록).
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
    const pendingGrant: PendingRewardGrant = {
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
      previewPoint,
    };
    const c = await confirmAdminAction({
      level: adminActionLevel("realPointGrant"),
      ko,
      title: ko ? "포인트 실지급" : "Grant real points",
      // V3-07 — 대상 닉네임과 지급액을 그대로 다시 입력해야 실행된다.
      retypeValue: `${userNickname} ${previewPoint}`,
      description: ko
        ? `${userNickname} (${userId}) 에게 최대 ${previewPoint}P 가 실제로 지급됩니다.`
        : `Up to ${previewPoint}P will actually be credited to ${userNickname} (${userId}).`,
      confirmLabel: adminCta("payout", ko),
      destructive: true,
      reasonPlaceholder: ko ? "지급 사유" : "Reason",
    });
    if (!c.ok || !c.reason) return;
    await confirmGrant(pendingGrant, c.reason);
  };

  const confirmGrant = async (pendingGrant: PendingRewardGrant, reason: string) => {
    setGrantBusy(true);
    try {
      const { previewPoint, ...rest } = pendingGrant;
      const res = await adminFetch("/api/admin/point-executions/reward", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, reason, confirmedPoint: previewPoint }),
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
      setRefresh((r) => r + 1);
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_execute" />

      <AdminTabs
        tabs={tabs}
        ariaLabel={ko ? "포인트 실행 탭" : "Point execution tabs"}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
      />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `실행 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

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
              <AdminActionButton type="submit" variant="primary" disabled={grantBusy || !action.allowed}>
                {ko ? "포인트 지급" : "Grant points"}
              </AdminActionButton>
            </form>
            <p className="mt-2 sam-text-helper text-sam-muted">
              {ko
                ? "시험용이 아닙니다 — 대상 회원에게 실제 포인트가 지급되고 원장에 기록됩니다."
                : "Not a dry run — real points are credited to the member and recorded in the ledger."}
            </p>
            {grantMsg ? <p className="mt-1 sam-text-body text-sam-fg">{grantMsg}</p> : null}
          </AdminCard>
          <AdminCard titleKey="admin_points_exec_card_history">
            <div className="mb-3">
              <AdminPointExecutionFilterBar lq={lq} pending={loading} />
            </div>
            <p className="mb-2 sam-text-body-secondary tabular-nums text-sam-muted" data-admin-list-total="1">
              {ko ? `총 ${formatAdminNumber(total)}건` : `${formatAdminNumber(total)} total`}
            </p>
            {loading ? (
              <AdminLoadingState ko={ko} />
            ) : error ? (
              <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={lq.refresh} />
            ) : executions.length === 0 ? (
              <AdminEmptyState
                ko={ko}
                message={lq.isFiltered ? undefined : t("admin_points_exec_history_empty")}
                onReset={lq.isFiltered ? lq.reset : undefined}
              />
            ) : (
              <AdminPointExecutionTable executions={executions} />
            )}
            {!error && total > 0 ? (
              <AdminPagination
                ko={ko}
                page={lq.query.page}
                size={lq.query.size}
                total={total}
                onPageChange={lq.setPage}
                onSizeChange={lq.setSize}
                disabled={loading}
              />
            ) : null}
          </AdminCard>
        </>
      )}

      {activeTab === "reclaim" && (
        <AdminCard titleKey="admin_points_exec_card_reclaim">
          {reclaimResult ? (
            <div className="mb-3">
              <AdminResultBanner ko={ko} result={reclaimResult} onClose={() => setReclaimResult(null)} />
            </div>
          ) : null}
          {loading ? (
            <AdminLoadingState ko={ko} />
          ) : error ? (
            <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={lq.refresh} />
          ) : reclaimPolicies.length === 0 ? (
            <AdminEmptyState ko={ko} message={t("admin_points_exec_reclaim_empty")} />
          ) : (
            <PointReclaimPolicyTable
              policies={reclaimPolicies}
              toggleDisabled={reclaimBusy || !action.allowed}
              onToggleActive={(p) => void toggleReclaim(p)}
            />
          )}
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard titleKey="admin_points_exec_card_logs">
          {loading ? (
            <AdminLoadingState ko={ko} />
          ) : error ? (
            <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={lq.refresh} />
          ) : (
            <PointRewardLogList logs={rewardLogs} />
          )}
        </AdminCard>
      )}
    </div>
  );
}
