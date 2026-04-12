"use client";

import type { ModerationAction } from "@/lib/types/report";
import { MODERATION_ACTION_LABELS } from "@/lib/admin-reports/report-admin-utils";

interface AdminModerationLogListProps {
  actions: ModerationAction[];
}

export function AdminModerationLogList({ actions }: AdminModerationLogListProps) {
  if (actions.length === 0) {
    return (
      <p className="text-[13px] text-sam-muted">처리 이력이 없습니다.</p>
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
            className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 text-[13px]"
          >
            <span className="font-medium text-sam-fg">
              {MODERATION_ACTION_LABELS[a.actionType] ?? a.actionType}
            </span>
            <span className="text-sam-muted">
              {new Date(a.createdAt).toLocaleString("ko-KR")}
            </span>
            <span className="text-sam-muted">· {a.adminNickname}</span>
            {a.note && (
              <span className="w-full text-sam-muted">메모: {a.note}</span>
            )}
          </li>
        ))}
    </ul>
  );
}
