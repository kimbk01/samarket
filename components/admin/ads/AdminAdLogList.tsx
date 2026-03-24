"use client";

import type { AdApplicationLog } from "@/lib/types/ad-application";

const ACTION_LABELS: Record<AdApplicationLog["actionType"], string> = {
  apply: "신청",
  update: "수정",
  cancel: "취소",
  mark_paid: "입금확인",
  approve: "승인",
  reject: "반려",
  activate: "노출시작",
  expire: "노출종료",
};

interface AdminAdLogListProps {
  logs: AdApplicationLog[];
}

export function AdminAdLogList({ logs }: AdminAdLogListProps) {
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
          <span className="text-gray-500">{log.actorNickname}</span>
          <span className="text-gray-500">{log.note}</span>
          <span className="ml-auto text-gray-400">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
