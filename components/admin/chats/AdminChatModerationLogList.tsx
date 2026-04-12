"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ChatModerationLog } from "@/lib/types/admin-chat";

const ACTION_LABELS: Record<string, string> = {
  warn: "채팅 경고",
  block_room: "채팅방 차단",
  unblock_room: "채팅방 해제",
  archive_room: "채팅방 보관",
  unarchive_room: "보관 해제",
  readonly_on: "읽기 전용",
  readonly_off: "읽기 전용 해제",
  hide_message: "메시지 숨김",
  review_only: "검토만",
  /** moderation_actions.action_type (API 매핑) */
  restrict_chat: "채팅 제한(차단)",
  lock_room: "방 잠금(보관)",
  mute_room: "읽기 전용(뮤트)",
};

interface AdminChatModerationLogListProps {
  logs: ChatModerationLog[];
}

export function AdminChatModerationLogList({ logs }: AdminChatModerationLogListProps) {
  const { t, tt } = useI18n();
  if (logs.length === 0) {
    return (
      <p className="text-[13px] text-sam-muted">{t("admin_chat_no_action_history")}</p>
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
            {tt(ACTION_LABELS[log.actionType] ?? log.actionType)}
          </span>
          <span className="text-sam-muted">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
          <span className="text-sam-muted">· {log.adminNickname}</span>
          {log.note && (
            <span className="w-full text-sam-muted">{t("admin_chat_note_label")}: {log.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
