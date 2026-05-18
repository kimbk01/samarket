"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ChatModerationLog } from "@/lib/types/admin-chat";

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  warn: "admin_chat_mod_warn",
  block_room: "admin_chat_mod_block_room",
  unblock_room: "admin_chat_mod_unblock_room",
  archive_room: "admin_chat_mod_archive_room",
  unarchive_room: "admin_chat_mod_unarchive_room",
  readonly_on: "admin_chat_mod_readonly_on",
  readonly_off: "admin_chat_mod_readonly_off",
  hide_message: "admin_chat_mod_hide_message",
  review_only: "admin_chat_mod_review_only",
  restrict_chat: "admin_chat_mod_restrict_chat",
  lock_room: "admin_chat_mod_lock_room",
  mute_room: "admin_chat_mod_mute_room",
};

interface AdminChatModerationLogListProps {
  logs: ChatModerationLog[];
}

export function AdminChatModerationLogList({ logs }: AdminChatModerationLogListProps) {
  const { t } = useI18n();
  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_chat_no_action_history")}</p>
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
          className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
        >
          <span className="font-medium text-sam-fg">
            {ACTION_LABEL_KEYS[log.actionType]
              ? t(ACTION_LABEL_KEYS[log.actionType]!)
              : log.actionType}
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
