import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCommunityMessengerDirectRoomFromProductChat } from "@/lib/community-messenger/service";
import { ensureProductChatRowForItemTrade } from "@/lib/trade/ensure-product-chat-for-item-trade";
import {
  persistProductChatMessengerRoomIdIfNull,
  syncChatRoomMessengerLink,
} from "@/lib/trade/persist-trade-messenger-room-link";
import type { TradeEntryPerfTrace } from "@/lib/trade/trade-entry-perf-log";
import type { ProductChatRow } from "@/lib/trade/resolve-product-chat";

function trimMid(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

export type EnsureMessengerRoomIdForItemTradeOpts = {
  /** `chat_rooms` 에서 이미 읽은 CM id — 중복 select 생략 */
  knownMessengerRoomId?: string;
  perf?: TradeEntryPerfTrace | null;
};

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
  chatRoomId?: string | null,
  opts?: EnsureMessengerRoomIdForItemTradeOpts
): Promise<string | undefined> {
  const perf = opts?.perf ?? null;
  try {
    const crId = chatRoomId?.trim() ?? "";
    const knownMid = trimMid(opts?.knownMessengerRoomId);
    let pc: ProductChatRow | null = null;
    if (crId) {
      perf?.mark("messenger_pc_lookup");
      const pcPromise = ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
      let onCr = knownMid;
      if (!onCr) {
        const crRes = await sb
          .from("chat_rooms")
          .select("community_messenger_room_id")
          .eq("id", crId)
          .eq("room_type", "item_trade")
          .maybeSingle();
        perf?.noteDbRoundTrip(1);
        onCr = trimMid((crRes.data as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id);
      }
      pc = (await pcPromise) as ProductChatRow | null;
      perf?.noteDbRoundTrip(1);
      if (!pc?.id) return undefined;
      if (onCr) {
        const storedPc = trimMid((pc as ProductChatRow).community_messenger_room_id);
        if (storedPc === onCr) {
          return onCr;
        }
        /** `chat_rooms` 만 연결된 레거시 — `product_chats` 쪽 FK 가 비면 목록 enrich 가 실패한다 */
        await persistProductChatMessengerRoomIdIfNull(sb, pc.id, onCr);
        perf?.noteDbRoundTrip(2);
        return onCr;
      }
    } else {
      pc = (await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId)) as ProductChatRow | null;
      perf?.noteDbRoundTrip(1);
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

    perf?.mark("messenger_room_ensure_sync");
    const out = await ensureCommunityMessengerDirectRoomFromProductChat(buyerId, pc.id, {
      itemTradeChatRoomId: crId || null,
      prefetchedProductChat: pc,
      deferSummaryHydration: true,
    });
    if (!out.ok || !out.roomId) return undefined;

    /**
     * 절대 조건: 거래 채팅은 `product_chats.community_messenger_room_id` 가 NULL 이면 실패.
     * ensure 성공 직후 원장 FK 를 반드시 고정한다.
     *
     * - item_trade(chat_rooms 경유)인 경우에도 목록 enrich 를 위해 product_chats 를 소스로 쓴다.
     * - 운영 데이터 보호: 이미 값이 있으면 덮어쓰지 않는다(불일치 케이스는 별도 보정 대상).
     */
    await persistProductChatMessengerRoomIdIfNull(sb, pc.id, out.roomId);
    perf?.noteDbRoundTrip(2);

    if (crId) {
      await syncChatRoomMessengerLink(sb, crId, out.roomId);
      perf?.noteDbRoundTrip(1);
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
