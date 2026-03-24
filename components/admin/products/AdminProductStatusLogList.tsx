"use client";

import type { ProductStatusLog } from "@/lib/types/product";

const STATUS_LABELS: Record<string, string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제",
};

interface AdminProductStatusLogListProps {
  logs: ProductStatusLog[];
}

export function AdminProductStatusLogList({ logs }: AdminProductStatusLogListProps) {
  if (logs.length === 0) {
    return (
      <p className="text-[13px] text-gray-500">상태 변경 이력이 없습니다.</p>
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
          className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2 text-[13px]"
        >
          <span className="text-gray-500">
            {STATUS_LABELS[log.fromStatus] ?? log.fromStatus} →{" "}
            {STATUS_LABELS[log.toStatus] ?? log.toStatus}
          </span>
          <span className="font-medium text-gray-700">{log.actionType}</span>
          <span className="text-gray-500">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
          <span className="text-gray-500">· {log.adminNickname}</span>
          {log.note && (
            <span className="w-full text-gray-600">메모: {log.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
