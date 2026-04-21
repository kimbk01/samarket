"use client";

import { useMemo, useState } from "react";
import { getPostReleaseChecks } from "@/lib/dev-sprints/mock-post-release-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPostReleasePhaseLabel,
  getPostReleaseStatusLabel,
  getPostReleasePriorityLabel,
} from "@/lib/dev-sprints/dev-sprint-utils";
import type {
  PostReleaseCheckPhase,
  PostReleaseCheckStatus,
} from "@/lib/types/dev-sprints";
import Link from "next/link";

export function PostReleaseCheckTable() {
  const [versionFilter, setVersionFilter] = useState<string>("");
  const [phaseFilter, setPhaseFilter] = useState<PostReleaseCheckPhase | "">("");
  const [statusFilter, setStatusFilter] = useState<PostReleaseCheckStatus | "">("");

  const checks = useMemo(
    () =>
      getPostReleaseChecks({
        ...(versionFilter ? { releaseVersion: versionFilter } : {}),
        ...(phaseFilter ? { phase: phaseFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [versionFilter, phaseFilter, statusFilter]
  );

  const versions = useMemo(() => {
    const list = getPostReleaseChecks();
    return [...new Set(list.map((c) => c.releaseVersion))].sort().reverse();
  }, []);

  const criticalBlocked = useMemo(
    () =>
      checks.filter((c) => c.priority === "critical" && c.status === "blocked"),
    [checks]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">버전</span>
        <select
          value={versionFilter}
          onChange={(e) => setVersionFilter(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">단계</span>
        <select
          value={phaseFilter}
          onChange={(e) =>
            setPhaseFilter((e.target.value || "") as PostReleaseCheckPhase | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="before_release">배포 전</option>
          <option value="just_after_release">배포 직후</option>
          <option value="after_24h">24시간 후</option>
          <option value="after_72h">72시간 후</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as PostReleaseCheckStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="todo">할 일</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="blocked">블로킹</option>
        </select>
      </div>

      {criticalBlocked.length > 0 && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50/50 p-3 sam-text-body-secondary text-red-800">
          critical 배포 후 검증이 블로킹된 항목이 {criticalBlocked.length}건 있습니다.
        </div>
      )}

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건의 배포 후 검증 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "버전",
            "단계",
            "제목",
            "상태",
            "우선순위",
            "담당",
            "확인일시",
            "연결",
          ]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "blocked" && c.priority === "critical"
                  ? "bg-red-50/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.releaseVersion}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getPostReleasePhaseLabel(c.phase)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "blocked"
                      ? "bg-red-100 text-red-800"
                      : c.status === "done"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getPostReleaseStatusLabel(c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getPostReleasePriorityLabel(c.priority)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.checkedAt
                  ? new Date(c.checkedAt).toLocaleString()
                  : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary">
                {c.linkedType === "deployment" && (
                  <Link href="/admin/recommendation-deployments" className="text-signature hover:underline">
                    배포
                  </Link>
                )}
                {c.linkedType === "qa_issue" && (
                  <Link href="/admin/qa-board" className="text-signature hover:underline">
                    QA
                  </Link>
                )}
                {!c.linkedType && "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
