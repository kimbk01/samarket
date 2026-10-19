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
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";

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

  const { policies, eventPolicies, logs, probabilityRules, loadProbabilityRules } =
    useAdminPointPolicyData(refresh);
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
    if (busy) return false;
    const c = await confirmAdminAction({
      level: "L2",
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
                ko
                  ? "단, 작업 기록 저장에 실패했습니다. 시스템 관리자에게 알려 주세요."
                  : "However, the activity log could not be saved. Tell a system admin."
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
      title: ko ? "정책 저장" : "Save policy",
      description: ko
        ? `「${full.boardName}」 포인트 정책을 저장합니다. 저장하면 이후 보상에 바로 적용됩니다.`
        : `Save the "${full.boardName}" point policy. It applies to new rewards immediately.`,
      successMessage: ko ? `「${full.boardName}」 정책을 저장했습니다.` : `Saved "${full.boardName}".`,
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
      title: ko ? "이벤트 정책 저장" : "Save event policy",
      description: ko
        ? `「${title}」 이벤트 정책을 저장합니다. 기간 중 보상 배수에 바로 적용됩니다.`
        : `Save the "${title}" event policy. It applies to reward multipliers immediately.`,
      successMessage: ko ? `「${title}」 이벤트 정책을 저장했습니다.` : `Saved "${title}".`,
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
      <AdminPageHeader titleKey="admin_points_policy_page" />
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
          {ko ? "저장 중…" : "Saving…"}
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

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

      {activeTab === "board" && (
        <>
          <AdminCard titleKey="admin_points_policy_card_board">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedPolicyId(null);
                  setShowBoardForm(true);
                }}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
              > {t("admin_points_policy_btn_add")}
              </button>
            </div>
            {showBoardForm && (
              <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
                <BoardPointPolicyForm
                  initial={selectedPolicy ?? undefined}
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
                  title: isActive ? (ko ? "정책 활성화" : "Activate policy") : ko ? "정책 비활성화" : "Deactivate policy",
                  description: ko
                    ? `「${name}」 포인트 정책을 ${isActive ? "활성화" : "비활성화"}합니다. 이후 보상에 바로 적용됩니다.`
                    : `${isActive ? "Activate" : "Deactivate"} the "${name}" point policy. It applies immediately.`,
                  successMessage: ko
                    ? `「${name}」 정책을 ${isActive ? "활성화" : "비활성화"}했습니다.`
                    : `${isActive ? "Activated" : "Deactivated"} "${name}".`,
                  destructive: !isActive,
                });
              }}
            />
          </AdminCard>
        </>
      )}

      {activeTab === "probability" && (
        <AdminCard titleKey="admin_points_policy_card_probability">
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
                    {p.boardName} ({p.boardKey})
                  </option>
                ))}
            </select>
          </div>
          <PointProbabilityRuleTable
            policyId={selectedPolicyId}
            rules={probabilityRules}
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
                title: ko ? "확률 규칙 저장" : "Save probability rule",
                description: ko
                  ? "랜덤 보상 확률 규칙을 저장합니다. 이후 보상에 바로 적용됩니다."
                  : "Save the random reward probability rule. It applies immediately.",
                successMessage: ko ? "확률 규칙을 저장했습니다." : "Saved the probability rule.",
              });
            }}
            onDeleteRule={(id) => {
              void mutatePolicy({
                url: "/api/admin/point-policies/probability",
                method: "POST",
                body: { deleteId: id },
                title: ko ? "확률 규칙 삭제" : "Delete probability rule",
                description: ko
                  ? "랜덤 보상 확률 규칙을 삭제합니다. 이후 보상에 바로 적용됩니다."
                  : "Delete the random reward probability rule. It applies immediately.",
                successMessage: ko ? "확률 규칙을 삭제했습니다." : "Deleted the probability rule.",
                destructive: true,
              });
            }}
          />
        </AdminCard>
      )}

      {activeTab === "event" && (
        <>
          <AdminCard titleKey="admin_points_policy_card_event">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingEventId(null);
                  setShowEventForm(true);
                }}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
              > {t("admin_points_policy_btn_add_event")}
              </button>
            </div>
            {showEventForm && (
              <div className="mb-4 rounded border border-sam-border bg-sam-app p-4">
                <PointEventPolicyForm
                  initial={editingEvent ?? undefined}
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
                    ? ko ? "이벤트 활성화" : "Activate event"
                    : ko ? "이벤트 비활성화" : "Deactivate event",
                  description: ko
                    ? `「${name}」 이벤트 정책을 ${isActive ? "활성화" : "비활성화"}합니다.`
                    : `${isActive ? "Activate" : "Deactivate"} the "${name}" event policy.`,
                  successMessage: ko
                    ? `「${name}」 이벤트를 ${isActive ? "활성화" : "비활성화"}했습니다.`
                    : `${isActive ? "Activated" : "Deactivated"} "${name}".`,
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
          <PointPolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
