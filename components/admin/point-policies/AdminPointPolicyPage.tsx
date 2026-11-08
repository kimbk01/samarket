"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { useAdminPointPolicyData } from "@/hooks/useAdminPointPolicyData";
import { BoardPointPolicyTable } from "./BoardPointPolicyTable";
import { BoardPointPolicyForm } from "./BoardPointPolicyForm";
import { PointProbabilityRuleTable } from "./PointProbabilityRuleTable";
import { PointEventPolicyTable } from "./PointEventPolicyTable";
import { PointEventPolicyForm } from "./PointEventPolicyForm";
import { PointRewardSimulator } from "./PointRewardSimulator";
import { PointPolicyLogList } from "./PointPolicyLogList";
import type { BoardPointPolicy } from "@/lib/types/point-policy";
import type { PointEventPolicy } from "@/lib/types/point-policy";
import { ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { ADMIN_LIST_QUERY_DEFAULT_SIZE, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import type { PointPolicyLog } from "@/lib/types/point-policy";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";

type TabId = "board" | "probability" | "event" | "simulate" | "logs";

type MutationResult = { ok: true; message: string } | { ok: false; code: string } | null;

export function AdminPointPolicyPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const tabs: { id: TabId; label: string }[] = [
    { id: "board", label: t("admin_points_policy_tab_board") },
    { id: "probability", label: t("admin_points_policy_tab_probability") },
    { id: "event", label: t("admin_points_policy_tab_event") },
    { id: "simulate", label: t("admin_points_policy_tab_simulate") },
    { id: "logs", label: t("admin_points_policy_tab_logs") },
  ];
  const [activeTab, setActiveTab] = useState<TabId>("board");
  const [refresh, setRefresh] = useState(0);
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const {
    policies,
    eventPolicies,
    probabilityRules,
    probabilityError,
    loadProbabilityRules,
    loading,
    loaded,
    error,
  } = useAdminPointPolicyData(refresh);
  /** 변경 로그 탭 — 서버 페이지 (예전 100건 고정 상한 제거). 필터가 없어 쪽·크기만 화면 상태. */
  const [logPage, setLogPage] = useState(1);
  const [logSize, setLogSize] = useState<AdminListPageSize>(ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const logs = useMemberOpsPagedFetch<PointPolicyLog>(
    activeTab === "logs" ? `/api/admin/point-policies/logs?limit=${logSize}&offset=${(logPage - 1) * logSize}` : null,
    "logs",
    refresh
  );
  /** 게시판·이벤트 정책 첫 로딩 전·실패 시 탭 본문(「정책 없음」 등)을 그리지 않는다. */
  const policyReady = loaded;
  const action = useAdminRouteAction("/admin/point-policies");
  const selectedPolicy = useMemo(
    () => (selectedPolicyId ? policies.find((p) => p.id === selectedPolicyId) : null),
    [policies, selectedPolicyId]
  );
  const editingEvent = useMemo(
    () => (editingEventId ? eventPolicies.find((p) => p.id === editingEventId) ?? null : null),
    [editingEventId, eventPolicies]
  );

  useEffect(() => {
    if (selectedPolicyId) void loadProbabilityRules(selectedPolicyId);
  }, [selectedPolicyId, refresh, loadProbabilityRules]);

  const refreshAll = useCallback(() => setRefresh((r) => r + 1), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MutationResult>(null);

  /**
   * 공통 포인트 정책 변경 — 확인(L2 사유 필수) → 저장 → 응답 확인 → 결과 배너.
   * 사유는 서버에서도 필수(400 reason_required)이며 감사 기록·정책 로그에 함께 남는다.
   */
  const mutatePolicy = async (input: {
    url: string;
    method: "POST" | "PATCH";
    body: Record<string, unknown>;
    title: string;
    description: string;
    successMessage: string;
    destructive?: boolean;
  }): Promise<boolean> => {
    if (busy || !action.allowed) return false;
    const c = await confirmAdminAction({
      level: adminActionLevel("pointPolicySave"),
      ko,
      title: input.title,
      description: input.description,
      confirmLabel: input.title,
      destructive: input.destructive,
    });
    if (!c.ok) return false;
    setBusy(true);
    setResult(null);
    try {
      const res = await adminFetch(input.url, {
        method: input.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input.body, reason: c.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        audit_warning?: string;
      };
      if (!res.ok || json.ok !== true) {
        setResult({ ok: false, code: json.error || (res.status === 403 ? "forbidden" : "save_failed") });
        return false;
      }
      setResult({
        ok: true,
        message:
          json.audit_warning === "audit_failed"
            ? `${input.successMessage} ${
                t("admin_point_policies_however_activity_log_could_not_saved")
              }`
            : input.successMessage,
      });
      refreshAll();
      return true;
    } catch {
      setResult({ ok: false, code: "network_error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBoardPolicy = async (values: Partial<BoardPointPolicy>) => {
    const full: Omit<BoardPointPolicy, "id" | "updatedAt"> & { id?: string } = {
      boardKey: values.boardKey ?? "general",
      boardName: values.boardName ?? t("admin_points_board_general"),
      isActive: values.isActive ?? true,
      writeRewardType: values.writeRewardType ?? "fixed",
      writeFixedPoint: values.writeFixedPoint ?? 0,
      writeRandomMin: values.writeRandomMin ?? 0,
      writeRandomMax: values.writeRandomMax ?? 0,
      writeCooldownSeconds: values.writeCooldownSeconds ?? 0,
      commentRewardType: values.commentRewardType ?? "fixed",
      commentFixedPoint: values.commentFixedPoint ?? 0,
      commentRandomMin: values.commentRandomMin ?? 0,
      commentRandomMax: values.commentRandomMax ?? 0,
      commentCooldownSeconds: values.commentCooldownSeconds ?? 0,
      likeRewardPoint: values.likeRewardPoint ?? 0,
      reportRewardPoint: values.reportRewardPoint ?? 0,
      maxFreeUserPointCap: values.maxFreeUserPointCap ?? 500,
      eventMultiplierEnabled: values.eventMultiplierEnabled ?? false,
      adminMemo: values.adminMemo,
      ...values,
      id: selectedPolicy?.id,
    } as Omit<BoardPointPolicy, "id" | "updatedAt"> & { id?: string };
    const ok = await mutatePolicy({
      url: "/api/admin/point-policies/board",
      method: "POST",
      body: full as unknown as Record<string, unknown>,
      title: t("admin_point_policies_save_policy"),
      description: t("admin_point_policies_save_point_policy_it_applies_new", { boardName: full.boardName }),
      successMessage: t("admin_point_policies_saved", { boardName: full.boardName }),
    });
    if (!ok) return;
    setShowBoardForm(false);
    setSelectedPolicyId(null);
  };

  const handleSaveEventPolicy = async (values: Partial<PointEventPolicy>) => {
    const title = values.title ?? "";
    const ok = await mutatePolicy({
      url: "/api/admin/point-policies/event",
      method: "POST",
      title: t("admin_point_policies_save_event_policy"),
      description: t("admin_point_policies_save_event_policy_it_applies_reward", { title }),
      successMessage: t("admin_point_policies_saved_2", { title }),
      body: {
        id: editingEventId ?? undefined,
        title: values.title ?? "",
        isActive: values.isActive ?? true,
        startAt: values.startAt ?? "",
        endAt: values.endAt ?? "",
        writeMultiplier: values.writeMultiplier ?? 1,
        commentMultiplier: values.commentMultiplier ?? 1,
        targetBoards: values.targetBoards ?? [],
        note: values.note ?? "",
        ...values,
      },
    });
    if (!ok) return;
    setShowEventForm(false);
    setEditingEventId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_policy" />
      <Suspense fallback={null}>
        <AdminOpsCrossLinkBar
          links={[
            {
              href: ARO_IA_001_COMMUNITY_POINT_POLICIES_PATH,
              labelKo: "커뮤니티 포인트 정책",
              labelEn: "Community point policies",
              dataAttr: "finance-point-to-community",
            },
          ]}
          noteKo="커뮤니티 적립/회수 정책입니다. 원장은 공통 Point(board_point_policies)를 사용합니다."
          noteEn="Community earn/reclaim policies. Ledger uses shared Point (board_point_policies)."
        />
      </Suspense>

      {busy ? (
        <p role="status" className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-muted">
          {t("common_saving")}
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      <AdminTabs
        tabs={tabs}
        ariaLabel={t("admin_point_policies_point_policy_tabs")}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
      />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {t("admin_point_policies_save_disabled", { reason: action.reason })}
        </p>
      ) : null}

      {activeTab !== "logs" && activeTab !== "simulate" ? (
        error ? (
          <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={refreshAll} />
        ) : loading && !loaded ? (
          <AdminLoadingState ko={ko} />
        ) : null
      ) : null}

      {activeTab === "board" && policyReady && (
        <>
          <AdminCard titleKey="admin_points_policy_card_board">
            <div className="mb-3 flex justify-end">
              <AdminActionButton
                variant="secondary"
                disabled={!action.allowed}
                onClick={() => {
                  setSelectedPolicyId(null);
                  setShowBoardForm(true);
                }}
              >
                {t("admin_points_policy_btn_add")}
              </AdminActionButton>
            </div>
            {showBoardForm && (
              <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
                <BoardPointPolicyForm
                  initial={selectedPolicy ?? undefined}
                  disabled={busy || !action.allowed}
                  onSubmit={handleSaveBoardPolicy}
                  onCancel={() => {
                    setShowBoardForm(false);
                    setSelectedPolicyId(null);
                  }}
                />
              </div>
            )}
            <BoardPointPolicyTable
              policies={policies}
              actionsDisabled={busy || !action.allowed}
              onEdit={(p) => {
                setSelectedPolicyId(p.id);
                setShowBoardForm(true);
              }}
              onToggleActive={(id, isActive) => {
                const name = policies.find((p) => p.id === id)?.boardName ?? id;
                void mutatePolicy({
                  url: `/api/admin/point-policies/board/${encodeURIComponent(id)}/active`,
                  method: "PATCH",
                  body: { isActive },
                  title: isActive ? t("admin_point_policies_activate_policy") : t("admin_point_policies_deactivate_policy"),
                  description: isActive
                    ? t("admin_point_policies_activate_policy_confirm", { name })
                    : t("admin_point_policies_deactivate_policy_confirm", { name }),
                  successMessage: isActive
                    ? t("admin_point_policies_policy_activated", { name })
                    : t("admin_point_policies_policy_deactivated", { name }),
                  destructive: !isActive,
                });
              }}
            />
          </AdminCard>
        </>
      )}

      {activeTab === "probability" && policyReady && (
        <AdminCard titleKey="admin_points_policy_card_probability">
          {probabilityError ? (
            <div className="mb-3">
              <AdminErrorState
                ko={ko}
                code={probabilityError.code}
                httpStatus={probabilityError.httpStatus}
                onRetry={() => {
                  if (selectedPolicyId) void loadProbabilityRules(selectedPolicyId);
                }}
              />
            </div>
          ) : null}
          <div className="mb-3">
            <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_select_policy")}
            </label>
            <select
              value={selectedPolicyId ?? ""}
              onChange={(e) =>
                setSelectedPolicyId(e.target.value || null)
              }
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_points_select")}</option>
              {policies
                .filter(
                  (p) =>
                    p.writeRewardType === "random" ||
                    p.commentRewardType === "random"
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.boardName}
                  </option>
                ))}
            </select>
          </div>
          <PointProbabilityRuleTable
            policyId={selectedPolicyId}
            rules={probabilityRules}
            actionsDisabled={busy || !action.allowed}
            policyBoardName={
              selectedPolicyId
                ? policies.find((p) => p.id === selectedPolicyId)?.boardName
                : undefined
            }
            onSaveRule={(rule) => {
              void mutatePolicy({
                url: "/api/admin/point-policies/probability",
                method: "POST",
                body: rule as unknown as Record<string, unknown>,
                title: t("admin_point_policies_save_probability_rule"),
                description: t("admin_point_policies_save_random_reward_probability_rule_it"),
                successMessage: t("admin_point_policies_saved_probability_rule"),
              });
            }}
            onDeleteRule={(id) => {
              void mutatePolicy({
                url: "/api/admin/point-policies/probability",
                method: "POST",
                body: { deleteId: id },
                title: t("admin_point_policies_delete_probability_rule"),
                description: t("admin_point_policies_delete_random_reward_probability_rule_it"),
                successMessage: t("admin_point_policies_deleted_probability_rule"),
                destructive: true,
              });
            }}
          />
        </AdminCard>
      )}

      {activeTab === "event" && policyReady && (
        <>
          <AdminCard titleKey="admin_points_policy_card_event">
            <div className="mb-3 flex justify-end">
              <AdminActionButton
                variant="secondary"
                disabled={!action.allowed}
                onClick={() => {
                  setEditingEventId(null);
                  setShowEventForm(true);
                }}
              >
                {t("admin_points_policy_btn_add_event")}
              </AdminActionButton>
            </div>
            {showEventForm && (
              <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
                <PointEventPolicyForm
                  initial={editingEvent ?? undefined}
                  disabled={busy || !action.allowed}
                  onSubmit={handleSaveEventPolicy}
                  onCancel={() => {
                    setShowEventForm(false);
                    setEditingEventId(null);
                  }}
                />
              </div>
            )}
            <PointEventPolicyTable
              policies={eventPolicies}
              actionsDisabled={busy || !action.allowed}
              onEdit={(p) => {
                setEditingEventId(p.id);
                setShowEventForm(true);
              }}
              onToggleActive={(id, isActive) => {
                const name = eventPolicies.find((p) => p.id === id)?.title ?? id;
                void mutatePolicy({
                  url: "/api/admin/point-policies/event",
                  method: "POST",
                  body: { setActive: { id, isActive } },
                  title: isActive
                    ? t("admin_point_policies_activate_event")
                    : t("admin_point_policies_deactivate_event"),
                  description: isActive
                    ? t("admin_point_policies_activate_event_confirm", { name })
                    : t("admin_point_policies_deactivate_event_confirm", { name }),
                  successMessage: isActive
                    ? t("admin_point_policies_event_activated", { name })
                    : t("admin_point_policies_event_deactivated", { name }),
                  destructive: !isActive,
                });
              }}
            />
          </AdminCard>
        </>
      )}

      {activeTab === "simulate" && (
        <AdminCard titleKey="admin_points_policy_card_simulate">
          <PointRewardSimulator />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard titleKey="admin_points_policy_card_logs">
          <MemberOpsListBody
            ko={ko}
            loading={logs.loading}
            loaded={logs.loaded}
            error={logs.error}
            onRetry={logs.reload}
            rowCount={logs.rows.length}
            total={logs.total}
            page={logPage}
            size={logSize}
            onPageChange={setLogPage}
            onSizeChange={(n) => {
              setLogSize(n);
              setLogPage(1);
            }}
            emptyMessage={t("admin_points_policy_log_empty")}
          >
            <PointPolicyLogList logs={logs.rows} />
          </MemberOpsListBody>
        </AdminCard>
      )}
    </div>
  );
}
