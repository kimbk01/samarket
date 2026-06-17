"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { chatListRoomTypeBadge } from "@/lib/community-messenger/chat-list/chat-room-type";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  room: CommunityMessengerRoomSummary;
  className?: string;
};

export function CommunityMessengerChatTypeBadge({ room, className = "" }: Props) {
  const { safeT } = useI18n();
  const badge = chatListRoomTypeBadge(room);
  const label = safeT(badge.labelKey as MessageKey, {
    fallbackKo:
      badge.roomType === "direct_trade"
        ? "거래"
        : badge.roomType === "direct_delivery"
          ? "배달"
          : badge.roomType === "group_general"
            ? "그룹"
            : badge.roomType === "archived"
              ? "보관"
              : "일반",
    fallbackEn:
      badge.roomType === "direct_trade"
        ? "Trade"
        : badge.roomType === "direct_delivery"
          ? "Delivery"
          : badge.roomType === "group_general"
            ? "Group"
            : badge.roomType === "archived"
              ? "Archive"
              : "General",
  });

  return (
    <span
      className={`shrink-0 rounded-[6px] border px-1 py-px sam-text-xxs font-semibold leading-none ${className}`.trim()}
      style={{
        color: badge.color,
        borderColor: badge.color,
        backgroundColor: `${badge.color}14`,
      }}
    >
      {label}
    </span>
  );
}
