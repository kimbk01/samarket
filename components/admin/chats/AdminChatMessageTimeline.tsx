"use client";

import type { AdminChatMessage } from "@/lib/types/admin-chat";

interface AdminChatMessageTimelineProps {
  messages: AdminChatMessage[];
}

export function AdminChatMessageTimeline({ messages }: AdminChatMessageTimelineProps) {
  if (messages.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-gray-500">메시지가 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-ui-rect border px-3 py-2 text-[14px] ${
            m.isHidden
              ? "border-gray-100 bg-gray-50 text-gray-400"
              : "border-gray-100 bg-white text-gray-800"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
            <span className="font-medium text-gray-700">{m.senderNickname}</span>
            <span>{new Date(m.createdAt).toLocaleString("ko-KR")}</span>
            {m.isReported && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                신고됨
              </span>
            )}
            {m.isHidden && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-gray-600">
                숨김
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{m.message}</p>
        </li>
      ))}
    </ul>
  );
}
