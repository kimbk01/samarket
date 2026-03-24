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
        <span className="text-[13px] text-gray-600">Day</span>
        <select
          value={dayNumber}
          onChange={(e) =>
            setDayNumber((e.target.value || "") as LaunchWeekDayNumber | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-gray-600">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as LaunchWeekIssueStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="open">오픈</option>
          <option value="investigating">조사중</option>
          <option value="mitigated">완화됨</option>
          <option value="resolved">해결됨</option>
        </select>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
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
              className={`border-b border-gray-100 ${
                i.severity === "critical" &&
                !["resolved", "mitigated"].includes(i.status)
                  ? "bg-red-50/30"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                Day {i.dayNumber}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {i.title}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getAreaLabel(i.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.severity === "critical"
                      ? "bg-red-100 text-red-800"
                      : i.severity === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getSeverityLabel(i.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
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
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(i.openedAt).toLocaleDateString()}
                {i.resolvedAt &&
                  ` → ${new Date(i.resolvedAt).toLocaleDateString()}`}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
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
              <td className="max-w-[140px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
