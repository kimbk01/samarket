"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RoomStatus } from "@/lib/types/admin-chat";

const LABELS: Record<RoomStatus, string> = {
  active: "활성",
  blocked: "차단",
  reported: "신고됨",
  archived: "보관",
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
  const { tt } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${CLASSES[status]} ${className}`}
    >
      {tt(LABELS[status])}
    </span>
  );
}
