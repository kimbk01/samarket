"use client";

import type { ReviewModerationLog } from "@/lib/types/admin-review";

const ACTION_LABELS: Record<string, string> = {
  hide_review: "리뷰 숨김",
  restore_review: "리뷰 복구",
  review_only: "검토만",
  recalculate_trust: "신뢰도 재계산",
};

interface AdminReviewModerationLogListProps {
  logs: ReviewModerationLog[];
}

export function AdminReviewModerationLogList({ logs }: AdminReviewModerationLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="text-[13px] text-sam-muted">조치 이력이 없습니다.</p>
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
