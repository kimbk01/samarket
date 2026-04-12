"use client";

import type { UserModerationLog } from "@/lib/types/admin-user";

const STATUS_LABELS: Record<string, string> = {
  normal: "정상",
  warned: "경고",
  suspended: "일시정지",
  banned: "영구정지",
};

const ACTION_LABELS: Record<string, string> = {
  warn: "경고",
  suspend: "일시정지",
  ban: "영구정지",
  restore: "정상복구",
  upgrade_premium: "특별회원 지정",
  downgrade_premium: "특별회원 해제",
};

interface AdminUserModerationLogListProps {
  logs: UserModerationLog[];
}

export function AdminUserModerationLogList({ logs }: AdminUserModerationLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="text-[13px] text-sam-muted">제재 이력이 없습니다.</p>
    );
  }
  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return (
    <ul className="space-y-2">
      {sorted.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 text-[13px]"
        >
          <span className="text-sam-muted">
            {STATUS_LABELS[log.fromStatus] ?? log.fromStatus} →{" "}
            {STATUS_LABELS[log.toStatus] ?? log.toStatus}
          </span>
          <span className="font-medium text-sam-fg">
            {ACTION_LABELS[log.actionType] ?? log.actionType}
          </span>
          <span className="text-sam-muted">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
          <span className="text-sam-muted">· {log.adminNickname}</span>
          {log.note && (
            <span className="w-full text-sam-muted">메모: {log.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
