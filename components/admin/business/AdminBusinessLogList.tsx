"use client";

import type { BusinessProfileLog } from "@/lib/types/business";

const ACTION_LABELS: Record<BusinessProfileLog["actionType"], string> = {
  apply: "신청",
  approve: "승인",
  reject: "반려",
  pause: "일시중지",
  resume: "재개",
  update_profile: "프로필 수정",
};

interface AdminBusinessLogListProps {
  logs: BusinessProfileLog[];
}

export function AdminBusinessLogList({ logs }: AdminBusinessLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">변경 이력이 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary last:border-0"
        >
          <span className="font-medium text-sam-fg">
            {ACTION_LABELS[log.actionType]}
          </span>
          <span className="text-sam-muted">{log.adminNickname}</span>
          <span className="text-sam-muted">{log.note}</span>
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
