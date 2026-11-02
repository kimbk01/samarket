"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerRoomChatUnavailableReason } from "@/lib/community-messenger/room/messenger-room-chat-unavailable";

const REASON_KEYS: Record<MessengerRoomChatUnavailableReason, MessageKey | null> = {
  blocked_by_me: "cm_social_blocked_message_denied",
  blocked_by_peer: null,
  rejected_by_peer: "cm_social_rejected_message_denied",
  store_order_closed: "nav_messenger_store_order_chat_closed",
  readonly: "nav_messenger_room_readonly_error",
  room_blocked: "cm_ui_blocked_room",
  archived: "nav_messenger_room_archived_error",
  unknown: null,
};

/**
 * 막힌 메신저 방 — 입력창 대신 표시(거래 채팅 `ChatDetailView` 차단 안내 줄과 같은 형식).
 * 높이는 입력 줄(44px)보다 낮아지지 않게 해 타임라인 하단 여백을 유지한다.
 */
export function MessengerRoomChatUnavailableBar({ reason }: { reason: MessengerRoomChatUnavailableReason }) {
  const { t } = useI18n();
  const reasonKey = REASON_KEYS[reason];
  return (
    <div
      data-cm-room-chat-unavailable={reason}
      role="status"
      className="flex min-h-[44px] w-full flex-col items-center justify-center px-4 py-2 text-center"
    >
      <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_chat_unavailable_title")}</p>
      {reasonKey ? <p className="mt-0.5 sam-text-helper break-words text-sam-muted">{t(reasonKey)}</p> : null}
    </div>
  );
}
