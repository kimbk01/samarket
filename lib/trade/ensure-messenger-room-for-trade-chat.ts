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
    const crId = chatRoomId?.trim() ?? "";
    let pc: ProductChatRow | null = null;
    if (crId) {
      const [pcRow, crRes] = await Promise.all([
        ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId),
        sb
          .from("chat_rooms")
          .select("community_messenger_room_id")
          .eq("id", crId)
          .eq("room_type", "item_trade")
          .maybeSingle(),
      ]);
      pc = pcRow as ProductChatRow | null;
      if (!pc?.id) return undefined;
      const onCr = trimMid((crRes.data as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id);
      if (onCr) return onCr;
    } else {
      pc = (await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId)) as ProductChatRow | null;
      if (!pc?.id) return undefined;
    }

    /**
     * `chat_rooms` 행이 있으면 메신저 키는 `trade_item:{chat_rooms.id}` 로 친구 DM 과 분리.
     * 레거시(chat_rooms 없이 product_chats 만)일 때만 PC 에 저장된 CM id 를 단일 경로로 쓴다.
     */
    const storedPc = trimMid((pc as ProductChatRow).community_messenger_room_id);
    if (storedPc && !crId) {
      return storedPc;
    }

    const out = await ensureCommunityMessengerDirectRoomFromProductChat(buyerId, pc.id, {
      itemTradeChatRoomId: crId || null,
      prefetchedProductChat: pc,
    });
    if (!out.ok || !out.roomId) return undefined;

    if (crId) {
      await syncChatRoomMessengerLink(sb, crId, out.roomId);
    }
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
