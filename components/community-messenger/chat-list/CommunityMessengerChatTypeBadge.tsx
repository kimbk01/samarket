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
  /** B4: 배지 키는 `chatListRoomTypeBadge` 의 5개뿐이고 모두 카탈로그에 있다 — 대체 문구 없음 */
  const label = safeT(badge.labelKey as MessageKey);

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
