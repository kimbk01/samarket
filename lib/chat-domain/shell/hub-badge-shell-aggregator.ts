import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainBadgeCounts = Readonly<Record<ChatDomain, number>>;

export type ChatDomainBadgeShellResult = Readonly<{
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
  socialChatUnread: number;
}>;

function count(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * Common Shell badge authority: Domain 결과를 읽고 합산만 한다.
 * Domain 분류·bump·clear·invalidate는 이 모듈에서 금지한다.
 */
export function aggregateChatDomainBadgeShell(
  domainCounts: ChatDomainBadgeCounts,
  philifeChatUnread = 0
): ChatDomainBadgeShellResult {
  const generalDirect = count(domainCounts.general_direct);
  const group = count(domainCounts.group);
  const trade = count(domainCounts.trade);
  const storeOrder = count(domainCounts.store_order);
  const communityMessengerUnread = generalDirect + group;

  return {
    communityMessengerUnread,
    tradeUnread: trade,
    storeOrderChatUnread: storeOrder,
    socialChatUnread: communityMessengerUnread + count(philifeChatUnread),
  };
}
