import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainNotificationCounts = Readonly<Record<ChatDomain, number>>;

function count(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/** Common Shell은 네 Domain 결과를 읽고 합산만 한다. */
export function aggregateChatDomainNotificationShell(
  counts: ChatDomainNotificationCounts
): number {
  return (
    count(counts.general_direct) +
    count(counts.group) +
    count(counts.trade) +
    count(counts.store_order)
  );
}
