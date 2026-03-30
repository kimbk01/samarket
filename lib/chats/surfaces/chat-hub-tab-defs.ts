/**
 * 채팅 허브 상단 탭 조립 — 거래채팅/커뮤니티/배달채팅 설정은 각 `*-chat-surface.ts`에만 둠.
 */

import type { ChatHubSegment } from "./chat-hub-segment";
import { COMMUNITY_CHAT_SURFACE } from "./community-chat-surface";
import { ORDER_CHAT_SURFACE } from "./order-chat-surface";
import { TRADE_CHAT_SURFACE } from "./trade-chat-surface";

export type ChatHubTabDef = { segment: ChatHubSegment; href: string; label: string };

export function buildChatHubTopTabDefs(opts: {
  /** 관리자 등에서 `/admin/order-chats` 등으로 교체 */
  orderChatsHref: string;
  showOrderTab: boolean;
}): ChatHubTabDef[] {
  const { orderChatsHref, showOrderTab } = opts;
  const base: ChatHubTabDef[] = [
    { segment: "trade", href: TRADE_CHAT_SURFACE.hubPath, label: TRADE_CHAT_SURFACE.hubTabLabel },
    {
      segment: "community",
      href: COMMUNITY_CHAT_SURFACE.hubPath,
      label: COMMUNITY_CHAT_SURFACE.hubTabLabel,
    },
  ];
  if (showOrderTab) {
    base.push({
      segment: "order",
      href: orderChatsHref,
      label: ORDER_CHAT_SURFACE.hubTabLabel,
    });
  }
  return base;
}
