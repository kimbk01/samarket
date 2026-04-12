"use client";

import { useMemo, useState } from "react";
import { getQaIssueLogs } from "@/lib/qa-board/mock-qa-issue-logs";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSeverityLabel,
  getIssueStatusLabel,
} from "@/lib/qa-board/qa-board-utils";
import type { QaIssueStatus, QaIssueSeverity } from "@/lib/types/qa-board";
import Link from "next/link";

export function QaIssueTable() {
  const [status, setStatus] = useState<QaIssueStatus | "">("");
  const [severity, setSeverity] = useState<QaIssueSeverity | "">("");
  const logs = useMemo(
    () =>
      getQaIssueLogs({
        ...(status ? { status: status as QaIssueStatus } : {}),
        ...(severity ? { severity: severity as QaIssueSeverity } : {}),
      }),
    [status, severity]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as QaIssueStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          <option value="open">오픈</option>
          <option value="in_progress">진행중</option>
          <option value="fixed">수정됨</option>
          <option value="verified">검증됨</option>
          <option value="wont_fix">미해결</option>
        </select>
        <span className="text-[13px] text-sam-muted">심각도</span>
        <select
          value={severity}
          onChange={(e) =>
            setSeverity((e.target.value || "") as QaIssueSeverity | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="medium">중간</option>
          <option value="low">낮음</option>
        </select>
      </div>

      <p className="text-[12px] text-sam-muted">
        재현 가능 여부(reproduced)는 placeholder로 표시됩니다.
      </p>

      {logs.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          QA 이슈가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "제목",
            "심각도",
            "상태",
            "연결 테스트",
            "재현",
            "담당",
            "비고",
          ]}
        >
          {logs.map((l) => (
            <tr
              key={l.id}
              className={`border-b border-sam-border-soft ${
                l.severity === "critical" && !["fixed", "verified", "wont_fix"].includes(l.status)
                  ? "bg-red-50/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {l.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    l.severity === "critical"
                      ? "bg-red-100 text-red-800"
                      : l.severity === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getSeverityLabel(l.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    l.status === "verified"
                      ? "bg-emerald-100 text-emerald-800"
                      : l.status === "open"
                        ? "bg-red-100 text-red-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getIssueStatusLabel(l.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {l.relatedTestCaseId ? (
                  <Link
                    href="/admin/qa-board"
                    className="text-signature hover:underline"
                  >
                    {l.relatedTestCaseId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {l.reproduced === true ? "Y" : l.reproduced === false ? "N" : "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-fg">
                {l.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-[13px] text-sam-muted">
                {l.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
