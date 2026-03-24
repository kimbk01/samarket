"use client";

import type { BannerChangeLog } from "@/lib/types/admin-banner";

const ACTION_LABELS: Record<BannerChangeLog["actionType"], string> = {
  create: "생성",
  update: "수정",
  activate: "활성화",
  pause: "일시중지",
  hide: "숨김",
  reorder: "순서변경",
  expire: "만료",
};

interface AdminBannerChangeLogListProps {
  logs: BannerChangeLog[];
}

export function AdminBannerChangeLogList({ logs }: AdminBannerChangeLogListProps) {
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
