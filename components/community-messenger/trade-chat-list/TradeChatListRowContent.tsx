"use client";

import type { ReactNode } from "react";
import type { PillarChatStatusChipTone } from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  productTitle: string;
  /** 1줄 상태 칩 (판매중·예약중·판매완료 등) — 없으면 그리지 않는다 */
  statusChip: { label: string; tone: PillarChatStatusChipTone } | null;
  /** 2줄 「판매|구매 · 상대 이름 · ₱가격」 (가격은 알 때만) */
  metaLine: string;
  /** 3줄 마지막 대화 */
  previewLine: string;
  unread: boolean;
};

/**
 * `/community-messenger/trade-chats` 행 — 채팅 시안 4판 「9. 거래 채팅 목록」.
 * 높이 84 · 좌우 16 · 간격 12 · 1줄 상품 이름 16/600 + 상태 칩 · 2줄 12.5 회색 · 3줄 마지막 대화 13.5(안 읽음 = 검정).
 */
export function TradeChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  productTitle,
  statusChip,
  metaLine,
  previewLine,
  unread,
}: Props) {
  return (
    <div className={`flex h-[84px] items-center gap-3 px-4 ${rowSurfaceClass}`} data-cm-pillar-row="trade">
      <div className="shrink-0">{avatar}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-[5px]">
          <p
            data-cm-list-title=""
            className="min-w-0 truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.2px]"
            style={{ color: "var(--cm-chat-fg)" }}
          >
            {productTitle}
          </p>
          {statusChip ? <span data-cm-pillar-chip={statusChip.tone}>{statusChip.label}</span> : null}
        </div>
        {metaLine ? (
          <p
            data-cm-pillar-meta=""
            className="min-w-0 truncate text-[12.5px] leading-[1.3]"
            style={{ color: "var(--cm-chat-sub)" }}
          >
            {metaLine}
          </p>
        ) : null}
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
