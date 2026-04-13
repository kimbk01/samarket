import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCommunityMessengerDirectRoomFromProductChat } from "@/lib/community-messenger/service";
import { ensureProductChatRowForItemTrade } from "@/lib/trade/ensure-product-chat-for-item-trade";
import { syncChatRoomMessengerLink } from "@/lib/trade/persist-trade-messenger-room-link";
import type { ProductChatRow } from "@/lib/trade/resolve-product-chat";

function trimMid(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

/**
 * 거래 채팅(item_trade / product_chats)에 대응하는 메신저 1:1 방 UUID.
 * `product_chats.community_messenger_room_id` 가 있으면 ensure 생략(원장 단일 경로).
 * `chatRoomId` 가 있으면 `chat_rooms` 행에도 FK 동기.
 */
export async function ensureMessengerRoomIdForItemTrade(
  sb: SupabaseClient<any>,
  buyerId: string,
  itemId: string,
  sellerId: string,
  chatRoomId?: string | null
): Promise<string | undefined> {
  try {
    const pc = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
    if (!pc?.id) return undefined;

    const stored = trimMid((pc as ProductChatRow).community_messenger_room_id);
    if (stored) {
      if (chatRoomId?.trim()) await syncChatRoomMessengerLink(sb, chatRoomId.trim(), stored);
      return stored;
    }

    const out = await ensureCommunityMessengerDirectRoomFromProductChat(buyerId, pc.id);
    if (!out.ok || !out.roomId) return undefined;

    if (chatRoomId?.trim()) await syncChatRoomMessengerLink(sb, chatRoomId.trim(), out.roomId);
    return out.roomId;
  } catch {
    return undefined;
  }
}

/** 이미 `product_chats.id` 를 알 때 (레거시 create-room 등) */
export async function ensureMessengerRoomIdForProductChat(
  userId: string,
  productChatId: string
): Promise<string | undefined> {
  try {
    const out = await ensureCommunityMessengerDirectRoomFromProductChat(userId, productChatId.trim());
    return out.ok && out.roomId ? out.roomId : undefined;
  } catch {
    return undefined;
  }
}
