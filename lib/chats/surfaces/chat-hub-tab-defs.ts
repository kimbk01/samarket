/**
 * 채팅 허브 상단 탭 조립 — 거래채팅/배달채팅만 유지.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { ChatHubSegment } from "./chat-hub-segment";
import { ORDER_CHAT_SURFACE } from "./order-chat-surface";
import { TRADE_CHAT_SURFACE } from "./trade-chat-surface";

export type ChatHubTabDef = { segment: ChatHubSegment; href: string; label: string; labelKey?: MessageKey };

export function buildChatHubTopTabDefs(opts: {
  /** 관리자 등에서 `/admin/order-chats` 등으로 교체 */
  orderChatsHref: string;
  showOrderTab: boolean;
}): ChatHubTabDef[] {
  const { orderChatsHref, showOrderTab } = opts;
  const base: ChatHubTabDef[] = [
    {
      segment: "trade",
      href: TRADE_CHAT_SURFACE.hubPath,
      label: TRADE_CHAT_SURFACE.hubTabLabel,
      labelKey: TRADE_CHAT_SURFACE.hubTabLabelKey,
    },
  ];
  if (showOrderTab) {
    base.push({
      segment: "order",
      href: orderChatsHref,
      label: ORDER_CHAT_SURFACE.hubTabLabel,
      labelKey: ORDER_CHAT_SURFACE.hubTabLabelKey,
    });
  }
  return base;
}
