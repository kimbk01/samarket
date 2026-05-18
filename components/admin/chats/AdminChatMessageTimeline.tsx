"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminChatMessage } from "@/lib/types/admin-chat";

interface AdminChatMessageTimelineProps {
  messages: AdminChatMessage[];
}

export function AdminChatMessageTimeline({ messages }: AdminChatMessageTimelineProps) {
  const { t } = useI18n();

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
            <span>{new Date(m.createdAt).toLocaleString("ko-KR")}</span>
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
          <p className="mt-1 whitespace-pre-wrap break-words">{m.message}</p>
        </li>
      ))}
    </ul>
  );
}
