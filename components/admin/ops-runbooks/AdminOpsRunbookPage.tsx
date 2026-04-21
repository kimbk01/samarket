"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookSummaryCards } from "./OpsRunbookSummaryCards";
import { OpsRunbookExecutionTable } from "./OpsRunbookExecutionTable";
import type { OpsRunbookExecutionStatus } from "@/lib/types/ops-runbook";

export function AdminOpsRunbookPage() {
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [statusFilter, setStatusFilter] = useState<OpsRunbookExecutionStatus | "">("");
  const [refresh, setRefresh] = useState(0);

  return (
    <>
      <AdminPageHeader title="운영 런북 실행" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/ops-runbooks/start"
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          새 실행 시작
        </Link>
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {activeTab === "list" ? "요약 보기" : "목록 보기"}
        </button>
      </div>
      {activeTab === "summary" ? (
        <AdminCard title="실행 요약">
          <OpsRunbookSummaryCards />
        </AdminCard>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="sam-text-body text-sam-fg">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OpsRunbookExecutionStatus | "")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">전체</option>
              <option value="in_progress">진행중</option>
              <option value="completed">완료</option>
              <option value="pending">대기</option>
              <option value="aborted">중단</option>
            </select>
          </div>
          <AdminCard title="실행 이력">
            <OpsRunbookExecutionTable statusFilter={statusFilter} refresh={refresh} />
          </AdminCard>
        </>
      )}
    </>
  );
}
