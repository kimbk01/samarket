"use client";

import { useMemo, useState } from "react";
import type { OpsChecklistItemStatus } from "@/lib/types/ops-board";
import { getOpsDailyChecklistItems } from "@/lib/ops-board/mock-ops-daily-checklist-items";
import { updateOpsDailyChecklistItem } from "@/lib/ops-board/mock-ops-daily-checklist-items";
import { createTodayChecklist } from "@/lib/ops-board/ops-board-utils";

const STATUS_LABELS: Record<OpsChecklistItemStatus, string> = {
  todo: "대기",
  in_progress: "진행중",
  done: "완료",
  skipped: "스킵",
  blocked: "차단",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const CATEGORY_LABELS: Record<string, string> = {
  monitoring: "모니터링",
  feed: "피드",
  ads: "광고",
  moderation: "검수",
  reports: "보고서",
  automation: "자동화",
};

const SURFACE_LABELS: Record<string, string> = {
  all: "전체",
  home: "홈",
  search: "검색",
  shop: "상점",
};

export function OpsChecklistTable() {
  const [checklistDate, setChecklistDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [refresh, setRefresh] = useState(0);

  const items = useMemo(
    () => getOpsDailyChecklistItems(checklistDate),
    [checklistDate, refresh]
  );

  const handleStatusChange = (id: string, status: OpsChecklistItemStatus) => {
    updateOpsDailyChecklistItem(id, {
      status,
      checkedAt: status === "done" ? new Date().toISOString() : null,
    });
    setRefresh((r) => r + 1);
  };

  const handleCreateFromTemplates = () => {
    createTodayChecklist(checklistDate);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[14px] font-medium text-sam-fg">점검일</label>
        <input
          type="date"
          value={checklistDate}
          onChange={(e) => setChecklistDate(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 text-[14px]"
        />
        <button
          type="button"
          onClick={handleCreateFromTemplates}
          className="rounded border border-signature bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          템플릿으로 당일 체크리스트 생성
        </button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          해당 날짜의 점검 항목이 없습니다. 위에서 &quot;템플릿으로 당일 체크리스트 생성&quot;을 눌러 주세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  제목
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  카테고리 / surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  우선순위
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  상태
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  담당
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  조치
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {i.title}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {CATEGORY_LABELS[i.category] ?? i.category} / {SURFACE_LABELS[i.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {PRIORITY_LABELS[i.priority]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        i.status === "done"
                          ? "bg-emerald-50 text-emerald-800"
                          : i.status === "in_progress"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {STATUS_LABELS[i.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {i.assignedAdminNickname ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status !== "done" && i.status !== "skipped" && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "in_progress")}
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800"
                        >
                          진행
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "done")}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800"
                        >
                          완료
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(i.id, "skipped")}
                          className="rounded border border-sam-border bg-sam-surface-muted px-2 py-1 text-[12px] text-sam-muted"
                        >
                          스킵
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
