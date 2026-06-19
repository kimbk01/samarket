/**
 * 거래·배달 CM 목록 lifecycle enrich 단일 진입점 (home-sync·bootstrap·trade-chat-list-meta).
 */
import { enrichDeliveryRoomLifecycleFieldsFromStoreOrders } from "@/lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich";
import { enrichTradeRoomLifecycleFieldsFromProductChats } from "@/lib/community-messenger/trade-chat-list/trade-context-meta-lifecycle-enrich";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

type LifecycleSupabase = {
  from: (table: string) => { select: (cols: string) => unknown };
};

/** product_chats·store_orders 원장 기준 lifecycle contextMeta + isReadonly 보강 */
export async function enrichCommerceChatRoomLifecycleForList(
  sb: LifecycleSupabase | null | undefined,
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  if (!sb || !summaries.length) return;
  await enrichTradeRoomLifecycleFieldsFromProductChats(sb, summaries);
  await enrichDeliveryRoomLifecycleFieldsFromStoreOrders(sb, summaries);
}
