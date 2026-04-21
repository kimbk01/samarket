"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getOpsRunbookExecutionById } from "@/lib/ops-runbooks/mock-ops-runbook-executions";
import { completeRunbookExecution, abortRunbookExecution } from "@/lib/ops-runbooks/ops-runbook-utils";
import { OpsRunbookStepWorkflow } from "./OpsRunbookStepWorkflow";
import { OpsRunbookResultForm } from "./OpsRunbookResultForm";
import { OpsRunbookExecutionLogList } from "./OpsRunbookExecutionLogList";
import { OpsKnowledgeRecommendationPanel } from "@/components/admin/ops-knowledge/OpsKnowledgeRecommendationPanel";
import { OpsRelatedDocumentPanel } from "@/components/admin/ops-knowledge-graph/OpsRelatedDocumentPanel";
import type { OpsKnowledgeRecommendSourceType } from "@/lib/types/ops-knowledge";

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  in_progress: "진행중",
  completed: "완료",
  aborted: "중단",
};

const LINKED_LABELS: Record<string, string> = {
  incident: "이슈",
  deployment: "배포",
  rollback: "롤백",
  fallback: "Fallback",
  kill_switch: "킬스위치",
  manual: "수동",
};

type TabId = "detail" | "steps" | "result" | "logs";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

export function OpsRunbookExecutionDetailPage({ executionId }: { executionId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("detail");
  const [refresh, setRefresh] = useState(0);

  const exec = useMemo(
    () => getOpsRunbookExecutionById(executionId),
    [executionId, refresh]
  );

  if (!exec) {
    return (
      <>
        <AdminPageHeader title="실행 없음" backHref="/admin/ops-runbooks" />
        <p className="sam-text-body text-sam-muted">해당 실행을 찾을 수 없습니다.</p>
      </>
    );
  }

  const handleComplete = () => {
    completeRunbookExecution(executionId, ADMIN_ID, ADMIN_NICK);
    setRefresh((r) => r + 1);
  };

  const handleAbort = () => {
    if (typeof window !== "undefined" && window.confirm("실행을 중단하시겠습니까?")) {
      abortRunbookExecution(executionId, ADMIN_ID, ADMIN_NICK, "관리자 중단");
      setRefresh((r) => r + 1);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "detail", label: "실행 상세" },
    { id: "steps", label: "단계 진행" },
    { id: "result", label: "결과 기록" },
    { id: "logs", label: "실행 로그" },
  ];

  return (
    <>
      <AdminPageHeader title={exec.documentTitle} backHref="/admin/ops-runbooks" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/ops-docs/${exec.documentId}`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          문서 보기
        </Link>
        {exec.executionStatus === "in_progress" && (
          <>
            <button
              type="button"
              onClick={handleComplete}
              className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
            >
              실행 완료
            </button>
            <button
              type="button"
              onClick={handleAbort}
              className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-800"
            >
              중단
            </button>
          </>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
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
      {activeTab === "detail" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,280px]">
          <AdminCard>
            <div className="space-y-4">
            <div className="flex flex-wrap gap-2 sam-text-body-secondary">
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {exec.documentType}
              </span>
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {LINKED_LABELS[exec.linkedType]}
                {exec.linkedId && ` · ${exec.linkedId}`}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  exec.executionStatus === "completed"
                    ? "bg-emerald-50 text-emerald-800"
                    : exec.executionStatus === "in_progress"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {STATUS_LABELS[exec.executionStatus]}
              </span>
            </div>
            <p className="sam-text-body text-sam-fg">{exec.summary}</p>
            {exec.resultNote && (
              <div className="rounded border border-sam-border-soft bg-sam-app p-3 sam-text-body-secondary text-sam-fg">
                결과 메모: {exec.resultNote}
              </div>
            )}
            <div className="border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">
              시작 {new Date(exec.startedAt).toLocaleString("ko-KR")} ·{" "}
              {exec.completedAt
                ? `완료 ${new Date(exec.completedAt).toLocaleString("ko-KR")}`
                : "진행 중"}
              {" · "}
              담당 {exec.startedByAdminNickname}
            </div>
          </div>
        </AdminCard>
        <div>
          <OpsKnowledgeRecommendationPanel
            sourceType={exec.linkedType as OpsKnowledgeRecommendSourceType}
            sourceId={exec.linkedId}
            title="관련 문서"
            compact
            recentViewSource="runbook"
          />
          <div className="mt-4">
            <OpsRelatedDocumentPanel title="그래프 Top 문서" compact />
          </div>
        </div>
        </div>
      )}
      {activeTab === "steps" && (
        <AdminCard title="단계 진행">
          <OpsRunbookStepWorkflow
            executionId={executionId}
            executionStatus={exec.executionStatus}
            onStepUpdate={() => setRefresh((r) => r + 1)}
          />
        </AdminCard>
      )}
      {activeTab === "result" && (
        <AdminCard title="대응 결과 기록">
          <OpsRunbookResultForm
            executionId={executionId}
            onSaved={() => setRefresh((r) => r + 1)}
          />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard title="실행 로그">
          <OpsRunbookExecutionLogList executionId={executionId} />
        </AdminCard>
      )}
    </>
  );
}
