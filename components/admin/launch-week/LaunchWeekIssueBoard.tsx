"use client";

import { useMemo, useState } from "react";
import { getLaunchWeekIssues } from "@/lib/launch-week/mock-launch-week-issues";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getAreaLabel,
  getSeverityLabel,
  getIssueStatusLabel,
} from "@/lib/launch-week/launch-week-utils";
import type {
  LaunchWeekDayNumber,
  LaunchWeekIssueStatus,
} from "@/lib/types/launch-week";
import Link from "next/link";

export function LaunchWeekIssueBoard() {
  const [dayNumber, setDayNumber] = useState<LaunchWeekDayNumber | "">("");
  const [status, setStatus] = useState<LaunchWeekIssueStatus | "">("");
  const issues = useMemo(
    () =>
      getLaunchWeekIssues({
        ...(dayNumber ? { dayNumber: dayNumber as LaunchWeekDayNumber } : {}),
        ...(status ? { status: status as LaunchWeekIssueStatus } : {}),
      }),
    [dayNumber, status]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">Day</span>
        <select
          value={dayNumber}
          onChange={(e) =>
            setDayNumber((e.target.value || "") as LaunchWeekDayNumber | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as LaunchWeekIssueStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="open">오픈</option>
          <option value="investigating">조사중</option>
          <option value="mitigated">완화됨</option>
          <option value="resolved">해결됨</option>
        </select>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          긴급 이슈가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "Day",
            "제목",
            "영역",
            "심각도",
            "상태",
            "담당",
            "오픈/해결",
            "연결",
            "비고",
          ]}
        >
          {issues.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-sam-border-soft ${
                i.severity === "critical" &&
                !["resolved", "mitigated"].includes(i.status)
                  ? "bg-red-50/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                Day {i.dayNumber}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {i.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getAreaLabel(i.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.severity === "critical"
                      ? "bg-red-100 text-red-800"
                      : i.severity === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getSeverityLabel(i.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.status === "resolved"
                      ? "bg-emerald-100 text-emerald-800"
                      : i.status === "open"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getIssueStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(i.openedAt).toLocaleDateString()}
                {i.resolvedAt &&
                  ` → ${new Date(i.resolvedAt).toLocaleDateString()}`}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.linkedType && i.linkedId ? (
                  i.linkedType === "qa_issue" ? (
                    <Link
                      href="/admin/qa-board"
                      className="text-signature hover:underline"
                    >
                      {i.linkedId}
                    </Link>
                  ) : (
                    `${i.linkedType}: ${i.linkedId}`
                  )
                ) : (
                  "-"
                )}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
