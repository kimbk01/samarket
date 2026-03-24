"use client";

import type { OpsActionItem } from "@/lib/types/ops-board";
import { updateOpsActionItem } from "@/lib/ops-board/mock-ops-action-items";

const STATUS_LABELS: Record<string, string> = {
  open: "미해결",
  planned: "예정",
  in_progress: "진행중",
  done: "완료",
  archived: "보관",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const SOURCE_LABELS: Record<string, string> = {
  checklist: "체크리스트",
  retrospective: "회고",
  incident: "이슈",
  report: "보고서",
  deployment: "배포",
  manual: "수동",
};

interface OpsActionCardProps {
  item: OpsActionItem;
  onUpdate?: () => void;
}

export function OpsActionCard({ item, onUpdate }: OpsActionCardProps) {
  const isOverdue =
    item.dueDate &&
    item.dueDate < new Date().toISOString().slice(0, 10) &&
    item.status !== "done" &&
    item.status !== "archived";

  const handleStatusChange = (status: OpsActionItem["status"]) => {
    updateOpsActionItem(item.id, { status });
    onUpdate?.();
  };

  return (
    <div
      className={`rounded-lg border p-4 ${
        isOverdue ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900">{item.title}</h3>
          <p className="mt-1 text-[13px] text-gray-600">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-gray-500">
            <span>{SOURCE_LABELS[item.sourceType] ?? item.sourceType}</span>
            <span>{PRIORITY_LABELS[item.priority]}</span>
            {item.dueDate && (
              <span className={isOverdue ? "font-medium text-red-600" : ""}>
                기한 {item.dueDate}
                {isOverdue ? " (초과)" : ""}
              </span>
            )}
            {item.ownerAdminNickname && (
              <span>담당 {item.ownerAdminNickname}</span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[12px] ${
            item.status === "done"
              ? "bg-emerald-50 text-emerald-800"
              : item.status === "in_progress"
                ? "bg-amber-50 text-amber-800"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      {item.status !== "done" && item.status !== "archived" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleStatusChange("in_progress")}
            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800"
          >
            진행
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("done")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800"
          >
            완료
          </button>
        </div>
      )}
    </div>
  );
}
