"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getBoardPointPolicies, saveBoardPointPolicy, setBoardPointPolicyActive } from "@/lib/point-policies/mock-board-point-policies";
import {
  getPointProbabilityRulesByPolicyId,
  savePointProbabilityRule,
  deletePointProbabilityRule,
} from "@/lib/point-policies/mock-point-probability-rules";
import { getPointEventPolicies, savePointEventPolicy, setPointEventPolicyActive } from "@/lib/point-policies/mock-point-event-policies";
import { getPointPolicyLogs } from "@/lib/point-policies/mock-point-policy-logs";
import { BoardPointPolicyTable } from "./BoardPointPolicyTable";
import { BoardPointPolicyForm } from "./BoardPointPolicyForm";
import { PointProbabilityRuleTable } from "./PointProbabilityRuleTable";
import { PointEventPolicyTable } from "./PointEventPolicyTable";
import { PointEventPolicyForm } from "./PointEventPolicyForm";
import { PointRewardSimulator } from "./PointRewardSimulator";
import { PointPolicyLogList } from "./PointPolicyLogList";
import type { BoardPointPolicy } from "@/lib/types/point-policy";
import type { PointEventPolicy } from "@/lib/types/point-policy";

type TabId = "board" | "probability" | "event" | "simulate" | "logs";

export function AdminPointPolicyPage() {
  const { t } = useI18n();
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

  const policies = useMemo(() => getBoardPointPolicies(), [refresh]);
  const selectedPolicy = useMemo(
    () => (selectedPolicyId ? policies.find((p) => p.id === selectedPolicyId) : null),
    [policies, selectedPolicyId]
  );
  const probabilityRules = useMemo(
    () =>
      selectedPolicyId
        ? getPointProbabilityRulesByPolicyId(selectedPolicyId)
        : [],
    [selectedPolicyId, refresh]
  );
  const eventPolicies = useMemo(() => getPointEventPolicies(), [refresh]);
  const editingEvent = useMemo(
    () => (editingEventId ? eventPolicies.find((p) => p.id === editingEventId) ?? null : null),
    [editingEventId, eventPolicies]
  );
  const logs = useMemo(() => getPointPolicyLogs(), [refresh]);

  const refreshAll = useCallback(() => setRefresh((r) => r + 1), []);

  const handleSaveBoardPolicy = (values: Partial<BoardPointPolicy>) => {
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
    saveBoardPointPolicy(full);
    refreshAll();
    setShowBoardForm(false);
    setSelectedPolicyId(null);
  };

  const handleSaveEventPolicy = (values: Partial<PointEventPolicy>) => {
    savePointEventPolicy({
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
    });
    refreshAll();
    setShowEventForm(false);
    setEditingEventId(null);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_points_policy_page" />

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
                setBoardPointPolicyActive(id, isActive);
                refreshAll();
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
              savePointProbabilityRule(rule);
              refreshAll();
            }}
            onDeleteRule={(id) => {
              deletePointProbabilityRule(id);
              refreshAll();
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
                setPointEventPolicyActive(id, isActive);
                refreshAll();
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
