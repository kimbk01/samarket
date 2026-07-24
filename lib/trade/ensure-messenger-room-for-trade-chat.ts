import type { SupabaseClient } from "@supabase/supabase-js";
import {
  newDomainSeparationCorrelationId,
  traceDomainSeparation,
} from "@/lib/chat-domain/domain-separation-trace";
import { ensureCommunityMessengerDirectRoomFromProductChat } from "@/lib/community-messenger/service";
import {
  isMessengerCommerceDirectKey,
  isMessengerGeneralFriendDirectKey,
} from "@/lib/community-messenger/messenger-room-domain";
import { ensureProductChatRowForItemTrade } from "@/lib/trade/ensure-product-chat-for-item-trade";
import {
  persistProductChatMessengerRoomId,
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
 * CM room is safe to reuse as trade only when domain/direct_key is commerce (not general friend).
 */
export async function isTradeCapableCommunityMessengerRoom(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<boolean> {
  const id = roomId.trim();
  if (!id) return false;
  const { data, error } = await sb
    .from("community_messenger_rooms")
    .select("direct_key, chat_domain")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  const domain = trimMid((data as { chat_domain?: unknown }).chat_domain);
  if (domain === "trade") return true;
  if (domain === "general_direct" || domain === "group" || domain === "store_order") return false;
  const dk = trimMid((data as { direct_key?: unknown }).direct_key) ?? "";
  if (isMessengerGeneralFriendDirectKey(dk)) return false;
  return isMessengerCommerceDirectKey(dk) && (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:"));
}

/**
 * 거래 채팅(item_trade / product_chats)에 대응하는 메신저 1:1 방 UUID.
 * `product_chats.community_messenger_room_id` 가 있으면 ensure 생략(원장 단일 경로) —
 * 단 general friend 방으로 오염된 FK 는 재사용하지 않는다.
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
  const correlationId = newDomainSeparationCorrelationId();
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
        const capable = await isTradeCapableCommunityMessengerRoom(sb, onCr);
        perf?.noteDbRoundTrip(1);
        if (!capable) {
          traceDomainSeparation({
            correlationId,
            phase: "ensure_messenger_for_trade",
            function: "ensureMessengerRoomIdForItemTrade",
            reason: "rejected_polluted_fk",
            roomId: onCr,
            itemId,
            sellerId,
            buyerId,
          });
          /** fall through to create a real trade CM room */
        } else {
          const storedPc = trimMid((pc as ProductChatRow).community_messenger_room_id);
          if (storedPc === onCr) {
            return onCr;
          }
          /** `chat_rooms` 만 연결된 레거시 — `product_chats` 쪽 FK 가 비면 목록 enrich 가 실패한다 */
          await persistProductChatMessengerRoomIdIfNull(sb, pc.id, onCr);
          perf?.noteDbRoundTrip(2);
          return onCr;
        }
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
      const capable = await isTradeCapableCommunityMessengerRoom(sb, storedPc);
      perf?.noteDbRoundTrip(1);
      if (capable) return storedPc;
      traceDomainSeparation({
        correlationId,
        phase: "ensure_messenger_for_trade",
        function: "ensureMessengerRoomIdForItemTrade",
        reason: "rejected_polluted_pc_fk",
        roomId: storedPc,
        itemId,
        sellerId,
        buyerId,
      });
    }

    perf?.mark("messenger_room_ensure_sync");
    const out = await ensureCommunityMessengerDirectRoomFromProductChat(buyerId, pc.id, {
      itemTradeChatRoomId: crId || null,
      prefetchedProductChat: pc,
      deferSummaryHydration: true,
    });
    if (!out.ok || !out.roomId) return undefined;

    /**
     * 거래 채팅은 `product_chats.community_messenger_room_id` 가 올바른 trade CM 이어야 한다.
     * - null → write
     * - polluted (general) → overwrite with trade room id
     * - already valid trade → keep
     */
    const curFk = trimMid((pc as ProductChatRow).community_messenger_room_id);
    if (!curFk) {
      await persistProductChatMessengerRoomIdIfNull(sb, pc.id, out.roomId);
    } else if (curFk !== out.roomId) {
      const curCapable = await isTradeCapableCommunityMessengerRoom(sb, curFk);
      if (!curCapable) {
        await persistProductChatMessengerRoomId(sb, pc.id, out.roomId);
      }
    }
    perf?.noteDbRoundTrip(2);

    if (crId) {
      await syncChatRoomMessengerLink(sb, crId, out.roomId);
      perf?.noteDbRoundTrip(1);
    }
    traceDomainSeparation({
      correlationId,
      phase: "ensure_messenger_for_trade",
      function: "ensureMessengerRoomIdForItemTrade",
      roomId: out.roomId,
      itemId,
      sellerId,
      buyerId,
      expectedDomain: "trade",
    });
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
