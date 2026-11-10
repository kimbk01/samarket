"use client";

import type { ReactNode } from "react";
import type { PillarChatStatusChipTone } from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  storeName: string;
  previewLine: string;
  /** 1줄 주문 상태 칩 — 상태를 모르면 그리지 않는다 */
  statusChip: { label: string; tone: PillarChatStatusChipTone } | null;
  unread: boolean;
};

/**
 * `/community-messenger/delivery-chats` 행 — 채팅 시안 4판 「10. 주문 채팅 목록」.
 * 높이 72 · 좌우 16 · 간격 12 · 1줄 매장 이름 16/600 + 상태 칩 · 2줄 마지막 대화 13.5(안 읽음 = 검정).
 */
export function DeliveryChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  storeName,
  previewLine,
  statusChip,
  unread,
}: Props) {
  return (
    <div className={`flex h-[72px] items-center gap-3 px-4 ${rowSurfaceClass}`} data-cm-pillar-row="delivery">
      <div className="shrink-0">{avatar}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-[5px]">
          <p
            data-cm-list-title=""
            className="min-w-0 truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.2px]"
            style={{ color: "var(--cm-chat-fg)" }}
          >
            {storeName}
          </p>
          {statusChip ? <span data-cm-pillar-chip={statusChip.tone}>{statusChip.label}</span> : null}
        </div>
        <p
          data-cm-list-preview=""
          className="min-w-0 truncate text-[13.5px] leading-[1.35]"
          style={{ color: unread ? "var(--cm-chat-fg)" : "var(--cm-chat-sub)" }}
        >
          {previewLine || " "}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 self-stretch">{trailing}</div>
    </div>
  );
}
