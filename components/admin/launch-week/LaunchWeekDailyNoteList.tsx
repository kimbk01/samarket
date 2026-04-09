"use client";

import { useMemo, useState } from "react";
import { getLaunchWeekDailyNotes } from "@/lib/launch-week/mock-launch-week-daily-notes";
import type { LaunchWeekDayNumber } from "@/lib/types/launch-week";

export function LaunchWeekDailyNoteList() {
  const [dayNumber, setDayNumber] = useState<LaunchWeekDayNumber | "">("");
  const notes = useMemo(
    () =>
      getLaunchWeekDailyNotes(
        dayNumber ? { dayNumber: dayNumber as LaunchWeekDayNumber } : undefined
      ),
    [dayNumber]
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
      </div>

      <p className="text-[12px] text-gray-500">
        Day별 summary note. 37단계 운영 보고서 handoff 요약과 연결 가능한 placeholder.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 Day 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-ui-rect border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center justify-between text-[12px] text-gray-500">
                <span>Day {n.dayNumber}</span>
                <span>
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-[14px] font-medium text-gray-900">
                요약
              </p>
              <p className="mt-1 text-[13px] text-gray-700">{n.summary}</p>
              <p className="mt-2 text-[13px] font-medium text-gray-800">
                주요 이슈
              </p>
              <p className="mt-1 text-[13px] text-gray-600">{n.topIssues}</p>
              <p className="mt-2 text-[13px] font-medium text-gray-800">
                주요 성과
              </p>
              <p className="mt-1 text-[13px] text-gray-600">{n.topWins}</p>
              {n.handoffNote && (
                <>
                  <p className="mt-2 text-[13px] font-medium text-gray-800">
                    인수인계
                  </p>
                  <p className="mt-1 text-[13px] text-gray-600">
                    {n.handoffNote}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
