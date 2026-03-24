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
        <span className="text-[13px] text-gray-600">월</span>
        <select
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-gray-500">
        월간 운영 회의 아젠다·handoff / owner rotation 은 placeholder로 확장 가능합니다.
      </p>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 월 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center justify-between text-[12px] text-gray-500">
                <span>{n.monthKey}</span>
                <span>
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-[14px] font-medium text-gray-900">요약</p>
              <p className="mt-1 text-[13px] text-gray-700">{n.summary}</p>
              <p className="mt-2 text-[13px] font-medium text-gray-800">주요 리스크</p>
              <p className="mt-1 text-[13px] text-gray-600">{n.topRisks}</p>
              <p className="mt-2 text-[13px] font-medium text-gray-800">주요 성과</p>
              <p className="mt-1 text-[13px] text-gray-600">{n.topWins}</p>
              {n.followUpFocus && (
                <>
                  <p className="mt-2 text-[13px] font-medium text-gray-800">후속 포커스</p>
                  <p className="mt-1 text-[13px] text-gray-600">{n.followUpFocus}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
