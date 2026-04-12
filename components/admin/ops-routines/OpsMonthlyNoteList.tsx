"use client";

import { useMemo, useState } from "react";
import { getOpsMonthlyNotes } from "@/lib/ops-routines/mock-ops-monthly-notes";

export function OpsMonthlyNoteList() {
  const [monthKey, setMonthKey] = useState<string>("");
  const notes = useMemo(
    () =>
      getOpsMonthlyNotes(monthKey ? { monthKey } : undefined),
    [monthKey]
  );

  const months = useMemo(() => {
    const list = getOpsMonthlyNotes();
    return [...new Set(list.map((n) => n.monthKey))].sort().reverse();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">월</span>
        <select
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-sam-muted">
        월간 운영 회의 아젠다·handoff / owner rotation 은 placeholder로 확장 가능합니다.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          해당 월 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            >
              <div className="flex items-center justify-between text-[12px] text-sam-muted">
                <span>{n.monthKey}</span>
                <span>
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-[14px] font-medium text-sam-fg">요약</p>
              <p className="mt-1 text-[13px] text-sam-fg">{n.summary}</p>
              <p className="mt-2 text-[13px] font-medium text-sam-fg">주요 리스크</p>
              <p className="mt-1 text-[13px] text-sam-muted">{n.topRisks}</p>
              <p className="mt-2 text-[13px] font-medium text-sam-fg">주요 성과</p>
              <p className="mt-1 text-[13px] text-sam-muted">{n.topWins}</p>
              {n.followUpFocus && (
                <>
                  <p className="mt-2 text-[13px] font-medium text-sam-fg">후속 포커스</p>
                  <p className="mt-1 text-[13px] text-sam-muted">{n.followUpFocus}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
