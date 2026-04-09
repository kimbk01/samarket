"use client";

import { useMemo, useState } from "react";
import { getLaunchWeekChecklistItems } from "@/lib/launch-week/mock-launch-week-checklist-items";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getAreaLabel,
  getChecklistStatusLabel,
  getPriorityLabel,
} from "@/lib/launch-week/launch-week-utils";
import type {
  LaunchWeekDayNumber,
  LaunchWeekChecklistStatus,
} from "@/lib/types/launch-week";

export function LaunchWeekChecklistTable() {
  const [dayNumber, setDayNumber] = useState<LaunchWeekDayNumber | "">("");
  const [status, setStatus] = useState<LaunchWeekChecklistStatus | "">("");
  const items = useMemo(
    () =>
      getLaunchWeekChecklistItems({
        ...(dayNumber ? { dayNumber: dayNumber as LaunchWeekDayNumber } : {}),
        ...(status ? { status: status as LaunchWeekChecklistStatus } : {}),
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
            setStatus((e.target.value || "") as LaunchWeekChecklistStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="todo">할 일</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="blocked">차단</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건 체크리스트가 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "Day",
            "영역",
            "제목",
            "상태",
            "우선순위",
            "담당",
            "차단/비고",
            "확인일시",
          ]}
        >
          {items.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-gray-100 ${
                i.status === "blocked" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                Day {i.dayNumber}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getAreaLabel(i.area)}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {i.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.status === "done"
                      ? "bg-emerald-100 text-emerald-800"
                      : i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getChecklistStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPriorityLabel(i.priority)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 text-[13px] text-gray-600">
                {i.blockerReason || i.note || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {i.checkedAt
                  ? new Date(i.checkedAt).toLocaleString()
                  : "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
