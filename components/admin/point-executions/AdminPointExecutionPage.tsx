"use client";

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
import { BOARD_OPTIONS, USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";
import { AdminPointExecutionFilterBar } from "./AdminPointExecutionFilterBar";
import { AdminPointExecutionTable } from "./AdminPointExecutionTable";
import { PointReclaimPolicyTable } from "./PointReclaimPolicyTable";
import { PointRewardLogList } from "./PointRewardLogList";

type TabId = "executions" | "reclaim" | "logs";

const TABS: { id: TabId; label: string }[] = [
  { id: "executions", label: "지급/실행 이력" },
  { id: "reclaim", label: "회수 정책" },
  { id: "logs", label: "지급·회수 로그" },
];

const DEFAULT_FILTERS: AdminPointExecutionFilters = {
  status: "",
  boardKey: "",
  actionType: "",
  userId: "",
};

export function AdminPointExecutionPage() {
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
    const userNickname = (form.querySelector('[name="userNickname"]') as HTMLInputElement)?.value ?? "테스트";
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
      <AdminPageHeader title="포인트 지급/회수 실행" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === t.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "executions" && (
        <>
          <AdminCard title="테스트 지급 실행">
            <form onSubmit={handleTestExecute} className="flex flex-wrap items-end gap-2 text-[14px]">
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">게시판</label>
                <select name="boardKey" className="rounded border border-sam-border px-2 py-1.5" defaultValue="general">
                  {BOARD_OPTIONS.map((b) => (
                    <option key={b.key} value={b.key}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">행동</label>
                <select name="actionType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="write">
                  <option value="write">글쓰기</option>
                  <option value="comment">댓글</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">대상 ID</label>
                <input name="targetId" type="text" className="w-28 rounded border border-sam-border px-2 py-1.5" defaultValue="post-test-1" />
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">대상 유형</label>
                <select name="targetType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="post">
                  <option value="post">글</option>
                  <option value="comment">댓글</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">사용자 ID</label>
                <input name="userId" type="text" className="w-24 rounded border border-sam-border px-2 py-1.5" defaultValue="me" />
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">닉네임</label>
                <input name="userNickname" type="text" className="w-24 rounded border border-sam-border px-2 py-1.5" defaultValue="테스트" />
              </div>
              <div>
                <label className="mb-0.5 block text-[12px] text-sam-muted">회원 유형</label>
                <select name="userType" className="rounded border border-sam-border px-2 py-1.5" defaultValue="free">
                  <option value="free">{USER_TYPE_LABELS.free}</option>
                  <option value="premium">{USER_TYPE_LABELS.premium}</option>
                </select>
              </div>
              <button type="submit" className="rounded border border-signature bg-signature px-3 py-1.5 text-[13px] font-medium text-white">
                실행
              </button>
            </form>
          </AdminCard>
          <AdminCard title="지급/차단 실행 이력">
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
        <AdminCard title="포인트 회수 정책">
          <PointReclaimPolicyTable policies={reclaimPolicies} />
        </AdminCard>
      )}

      {activeTab === "logs" && (
        <AdminCard title="지급·회수 로그">
          <PointRewardLogList logs={rewardLogs} />
        </AdminCard>
      )}
    </div>
  );
}
