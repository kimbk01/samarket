"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { RoomStatus } from "@/lib/types/admin-chat";

const LABEL_KEYS: Record<RoomStatus, MessageKey> = {
  active: "admin_chat_status_active",
  blocked: "admin_chat_status_blocked",
  reported: "admin_chat_status_reported",
  archived: "admin_chat_status_archived",
};

const CLASSES: Record<RoomStatus, string> = {
  active: "bg-emerald-50 text-emerald-800",
  blocked: "bg-red-50 text-red-700",
  reported: "bg-amber-100 text-amber-800",
  archived: "bg-sam-surface-muted text-sam-fg",
};

interface AdminChatRoomStatusBadgeProps {
  status: RoomStatus;
  className?: string;
}

export function AdminChatRoomStatusBadge({
  status,
  className = "",
}: AdminChatRoomStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(LABEL_KEYS[status])}
    </span>
  );
}
