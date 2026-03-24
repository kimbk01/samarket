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
      <p className="text-[13px] text-gray-500">변경 이력이 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-2 text-[13px] last:border-0"
        >
          <span className="font-medium text-gray-700">
            {ACTION_LABELS[log.actionType]}
          </span>
          <span className="text-gray-500">{log.adminNickname}</span>
          <span className="text-gray-500">{log.note}</span>
          <span className="ml-auto text-gray-400">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
