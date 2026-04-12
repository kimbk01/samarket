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
        <span className="text-[13px] text-sam-muted">Day</span>
        <select
          value={dayNumber}
          onChange={(e) =>
            setDayNumber((e.target.value || "") as LaunchWeekDayNumber | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-sam-muted">
        Day별 summary note. 37단계 운영 보고서 handoff 요약과 연결 가능한 placeholder.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 Day 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            >
              <div className="flex items-center justify-between text-[12px] text-sam-muted">
                <span>Day {n.dayNumber}</span>
                <span>
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-[14px] font-medium text-sam-fg">
                요약
              </p>
              <p className="mt-1 text-[13px] text-sam-fg">{n.summary}</p>
              <p className="mt-2 text-[13px] font-medium text-sam-fg">
                주요 이슈
              </p>
              <p className="mt-1 text-[13px] text-sam-muted">{n.topIssues}</p>
              <p className="mt-2 text-[13px] font-medium text-sam-fg">
                주요 성과
              </p>
              <p className="mt-1 text-[13px] text-sam-muted">{n.topWins}</p>
              {n.handoffNote && (
                <>
                  <p className="mt-2 text-[13px] font-medium text-sam-fg">
                    인수인계
                  </p>
                  <p className="mt-1 text-[13px] text-sam-muted">
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
