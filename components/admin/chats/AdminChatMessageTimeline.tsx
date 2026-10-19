"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import type { AdminChatMessage } from "@/lib/types/admin-chat";
import { AdminCmMessageBody, AdminCmMessageKindBadge } from "./AdminCmMessageBody";

interface AdminChatMessageTimelineProps {
  messages: AdminChatMessage[];
  /** R1-B C-1: 사용자 방(CM) 메시지일 때만 — 메시지 숨김/해제 (CM 관리자 경로) */
  onToggleHidden?: (message: AdminChatMessage, hidden: boolean) => void;
  busyMessageId?: string | null;
}

export function AdminChatMessageTimeline({ messages, onToggleHidden, busyMessageId = null }: AdminChatMessageTimelineProps) {
  const { t, language } = useI18n();

  if (messages.length === 0) {
    return (
      <p className="py-6 text-center sam-text-body-secondary text-sam-muted">
        {t("admin_chat_no_messages")}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-ui-rect border px-3 py-2 sam-text-body ${
            m.isHidden
              ? "border-sam-border-soft bg-sam-app text-sam-meta"
              : "border-sam-border-soft bg-sam-surface text-sam-fg"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
            <span className="font-medium text-sam-fg">{m.senderNickname}</span>
            <span>{formatAdminDateTime(m.createdAt, language)}</span>
            {m.display ? <AdminCmMessageKindBadge kind={m.display.kind} /> : null}
            {m.isReported && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                {t("admin_chat_status_reported")}
              </span>
            )}
            {m.isHidden && (
              <span className="rounded bg-sam-border-soft px-1.5 py-0.5 text-sam-muted">
                {t("admin_dashboard_product_hidden")}
              </span>
            )}
          </div>
          <div className="mt-1 break-words">
            {m.display ? (
              <AdminCmMessageBody display={m.display} fallbackText={m.message} />
            ) : (
              <p className="whitespace-pre-wrap break-words">{m.message}</p>
            )}
          </div>
          {onToggleHidden && m.messageType !== "system" ? (
            <div className="mt-2">
              <button
                type="button"
                disabled={busyMessageId === m.id}
                onClick={() => onToggleHidden(m, !m.isHidden)}
                className="rounded border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-helper text-sam-fg hover:bg-sam-app disabled:opacity-50"
              >
                {m.isHidden ? t("admin_chat_r1b_unhide_message") : t("admin_chat_r1b_hide_message")}
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
