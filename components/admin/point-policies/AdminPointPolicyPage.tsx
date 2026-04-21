"use client";

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

const TABS: { id: TabId; label: string }[] = [
  { id: "board", label: "게시판 정책" },
  { id: "probability", label: "확률 구간" },
  { id: "event", label: "이벤트 배율" },
  { id: "simulate", label: "시뮬레이션" },
  { id: "logs", label: "변경 이력" },
];

export function AdminPointPolicyPage() {
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
      boardName: values.boardName ?? "자유게시판",
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
      <AdminPageHeader title="포인트 정책" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === t.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "board" && (
        <>
          <AdminCard title="게시판별 포인트 정책">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedPolicyId(null);
                  setShowBoardForm(true);
                }}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
              >
                정책 추가
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
        <AdminCard title="확률 구간 (확률형 정책용)">
          <div className="mb-3">
            <label className="mb-1 block sam-text-body font-medium text-sam-fg">
              정책 선택
            </label>
            <select
              value={selectedPolicyId ?? ""}
              onChange={(e) =>
                setSelectedPolicyId(e.target.value || null)
              }
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">선택</option>
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
          <AdminCard title="이벤트 포인트 배율">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingEventId(null);
                  setShowEventForm(true);
                }}
                className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
              >
                이벤트 추가
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
        <AdminCard title="포인트 지급 시뮬레이션">
          <PointRewardSimulator />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard title="정책 변경 이력">
          <PointPolicyLogList logs={logs} />
        </AdminCard>
      )}
    </div>
  );
}
