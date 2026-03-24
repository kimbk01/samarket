"use client";

import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";

/** `/chats` — 글로벌 1단 대신 거래용 앱바 + 채팅 구분 탭(주문 채팅은 `/orders` 탭) */
export function ChatsHubStickyAppBar({ segment }: { segment: ChatHubSegment }) {
  return (
    <TradePrimaryColumnStickyAppBar
      title="채팅"
      backButtonProps={{
        preferHistoryBack: true,
        backHref: "/home",
        ariaLabel: "이전 화면",
      }}
      shellFooter={
        <div className="border-t border-black/[0.08]">
          <ChatHubTopTabs active={segment} showOrderTab={false} />
        </div>
      }
    />
  );
}
