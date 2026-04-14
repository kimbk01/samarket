/**
 * GET /api/order-chat/orders/:orderId 과 동일 — RSC에서 선로딩할 때 사용.
 */
import type { OrderChatSnapshotResult } from "@/lib/chat-domain/ports/order-chat-read";
import { loadOrderChatSnapshotForOrder } from "@/lib/chat-domain/use-cases/order-chat-snapshot";
import { createOrderChatReadAdapter } from "@/lib/order-chat/order-chat-read-adapter";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export async function loadOrderChatSnapshotForPage(
  userId: string,
  orderId: string
): Promise<OrderChatSnapshotResult | null> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return null;
  const port = createOrderChatReadAdapter(sb);
  return loadOrderChatSnapshotForOrder(port, userId, orderId.trim());
}
