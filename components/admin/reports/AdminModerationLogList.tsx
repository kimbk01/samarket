"use client";

import type { ModerationAction } from "@/lib/types/report";
import { MODERATION_ACTION_LABELS } from "@/lib/admin-reports/report-admin-utils";

interface AdminModerationLogListProps {
  actions: ModerationAction[];
}

export function AdminModerationLogList({ actions }: AdminModerationLogListProps) {
  if (actions.length === 0) {
    return (
      <p className="text-[13px] text-gray-500">처리 이력이 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {actions
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2 text-[13px]"
          >
            <span className="font-medium text-gray-800">
              {MODERATION_ACTION_LABELS[a.actionType] ?? a.actionType}
            </span>
            <span className="text-gray-500">
              {new Date(a.createdAt).toLocaleString("ko-KR")}
            </span>
            <span className="text-gray-500">· {a.adminNickname}</span>
            {a.note && (
              <span className="w-full text-gray-600">메모: {a.note}</span>
            )}
          </li>
        ))}
    </ul>
  );
}
