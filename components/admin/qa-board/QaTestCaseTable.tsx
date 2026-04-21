"use client";

import { useMemo, useState } from "react";
import { getQaTestCases } from "@/lib/qa-board/mock-qa-test-cases";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCaseStatusLabel,
  getPriorityLabel,
  getEnvLabel,
} from "@/lib/qa-board/qa-board-utils";
import type {
  QaTestCaseStatus,
  QaTestEnvironment,
} from "@/lib/types/qa-board";
import Link from "next/link";

export function QaTestCaseTable() {
  const [status, setStatus] = useState<QaTestCaseStatus | "">("");
  const [environment, setEnvironment] = useState<QaTestEnvironment | "">("");
  const cases = useMemo(
    () =>
      getQaTestCases({
        ...(status ? { status: status as QaTestCaseStatus } : {}),
        ...(environment
          ? { environment: environment as QaTestEnvironment }
          : {}),
      }),
    [status, environment]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as QaTestCaseStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="not_started">미실행</option>
          <option value="in_progress">진행중</option>
          <option value="passed">통과</option>
          <option value="failed">실패</option>
          <option value="blocked">차단</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">환경</span>
        <select
          value={environment}
          onChange={(e) =>
            setEnvironment((e.target.value || "") as QaTestEnvironment | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="local">Local</option>
          <option value="staging">Staging</option>
          <option value="production_candidate">Production 후보</option>
        </select>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          테스트 케이스가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "제목",
            "상태",
            "우선순위",
            "Must-Pass",
            "담당",
            "실행일시",
            "환경",
            "실패/차단 사유",
            "연결",
          ]}
        >
          {cases.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.isMustPass && (c.status === "failed" || c.status === "blocked")
                  ? "bg-red-50/30"
                  : c.status === "failed" || c.status === "blocked"
                    ? "bg-amber-50/20"
                    : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "passed"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : c.status === "blocked"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getCaseStatusLabel(c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(c.priority)}
              </td>
              <td className="px-3 py-2.5">
                {c.isMustPass ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 sam-text-helper text-red-800">
                    필수
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.executedAt
                  ? new Date(c.executedAt).toLocaleString()
                  : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getEnvLabel(c.environment)}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.failureNote || c.blockerReason || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.linkedType && c.linkedId ? (
                  c.linkedType === "readiness_item" ? (
                    <Link
                      href="/admin/launch-readiness"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  ) : c.linkedType === "migration_table" ? (
                    <Link
                      href="/admin/production-migration"
                      className="text-signature hover:underline"
                    >
                      {c.linkedId}
                    </Link>
                  ) : (
                    `${c.linkedType}: ${c.linkedId}`
                  )
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
