/**
 * 사용자 기준 채팅 미읽음 — product_chats 와 chat_rooms(item_trade) 동시 존재 시 이중 집계 방지.
 * - store_order / 기타 chat_rooms: 참가자 `unread_count` 합산
 * - item_trade: `last_message_id`·`last_read_message_id` 기준 `tradeListUnreadHintFromCursor`(0/1) 합산 — `unread_count` 미사용
 * - `item_trade` + `community_messenger_room_id`: 메신저 참가자 unread 가 진실이므로 여기서 힌트 합산 제외(하단 메신저 탭 `+ communityMessengerUnread` 이중 방지)
 * - product_chats: 동일 거래에 item_trade 통합방이 있으면 스킵(통합방 힌트만 반영)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { tradeListUnreadHintFromCursor } from "@/lib/chats/server/trade-list-unread-hint";

export type UserChatUnreadParts = {
  /** store_order 방 참가자 unread 합 (매장·주문 채팅) */
  storeOrderParticipantUnread: number;
  /** item_trade 방 미읽음 힌트 합(0/1·방당) — 목록 API와 동일 규칙 */
  itemTradeParticipantUnread: number;
  /**
   * 거래·매장이 아닌 chat_rooms 참가자 unread 합
   * (general_chat, community, group, business 및 기타 room_type)
   */
  communityParticipantUnread: number;
  /** 통합방과 묶이지 않은 product_chats unread 합 */
  productChatUnreadDeduped: number;
};

/** 배지 API와 맞춰 짧은 구간 중복 DB 집계 방지 — 무효화 직후에도 체감 지연을 줄이기 위해 보수적으로 짧게 둔다 */
const UNREAD_CACHE_TTL_MS = 4_000;
const unreadPartsCache = new Map<
  string,
  { value: UserChatUnreadParts; expiresAt: number }
>();
const unreadPartsFlights = new Map<string, Promise<UserChatUnreadParts>>();

/** 읽음 API 직후 배지 계산이 바로 새 값을 보도록 */
export function invalidateUserChatUnreadCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  unreadPartsCache.delete(k);
}

function pruneExpiredUnreadCache(now: number) {
  for (const [key, entry] of unreadPartsCache) {
    if (entry.expiresAt <= now) unreadPartsCache.delete(key);
  }
  while (unreadPartsCache.size > 200) {
    const k = unreadPartsCache.keys().next().value;
    if (k === undefined) break;
    unreadPartsCache.delete(k);
  }
}

/** 목록·미읽음 집계 공통 — 나간/비활성 참가자 행 제외 */
export function participantRowActive(p: {
  hidden?: boolean;
  left_at?: string | null;
  is_active?: boolean | null;
}): boolean {
  if (p.hidden) return false;
  if (p.left_at) return false;
  if (p.is_active === false) return false;
  return true;
}

function roomEligibleForUnread(meta: { is_locked?: boolean | null; room_type?: string | null } | undefined): boolean {
  if (!meta) return false;
  /** store_order: 완료 후에도 채팅·미읽음 유지(잠금 플래그와 분리) */
  if (meta.is_locked && meta.room_type !== "store_order") return false;
  return true;
}

export async function computeUserChatUnreadParts(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<UserChatUnreadParts> {
  const { data: partRows, error: partErr } = await sbAny
    .from("chat_room_participants")
    .select("room_id, unread_count, last_read_message_id, hidden, left_at, is_active")
    .eq("user_id", userId)
    .eq("hidden", false);

  const partsRaw = partErr ? [] : (partRows ?? []);
  const parts = (
    partsRaw as {
      room_id: string;
      unread_count?: number;
      last_read_message_id?: string | null;
      hidden?: boolean;
      left_at?: string | null;
      is_active?: boolean | null;
    }[]
  ).filter(
    (p) => participantRowActive(p)
  );
  const roomIds = [...new Set((parts as { room_id: string }[]).map((p) => p.room_id).filter(Boolean))];

  let storeOrderParticipantUnread = 0;
  let itemTradeParticipantUnread = 0;
  let communityParticipantUnread = 0;
  const linkedKeys = new Set<string>();

  type CrMeta = {
    id: string;
    room_type?: string | null;
    item_id?: string | null;
    seller_id?: string;
    buyer_id?: string;
    is_locked?: boolean | null;
    last_message_id?: string | null;
    /** 메신저 통합방과 연결된 거래 채팅 — CM `participants.unread_count` 가 진실이므로 여기서 힌트를 또 합치면 하단 탭 이중 집계 */
    community_messenger_room_id?: string | null;
  };

  const [crRowsFlat, pcRes] = await Promise.all([
    (async (): Promise<CrMeta[]> => {
      if (roomIds.length === 0) return [];
      const batch = await Promise.all(
        chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE).map(async (ids) => {
          const { data, error } = await sbAny
            .from("chat_rooms")
            .select("id, room_type, item_id, seller_id, buyer_id, is_locked, last_message_id, community_messenger_room_id")
            .in("id", ids);
          if (error) return [];
          return (data ?? []) as CrMeta[];
        })
      );
      return batch.flat();
    })(),
    sbAny
      .from("product_chats")
      .select("post_id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`),
  ]);

  const crRows: CrMeta[] = crRowsFlat;
  const metaByRoom = new Map(crRows.map((r) => [r.id, r]));

  const itemTradeLastMsgIds = [
    ...new Set(
      crRows
        .filter((r) => r.room_type === "item_trade" && r.last_message_id)
        .map((r) => String(r.last_message_id))
        .filter(Boolean)
    ),
  ];
  let senderByLastMessageId = new Map<string, string>();
  if (itemTradeLastMsgIds.length > 0) {
    const { data: lastRows } = await sbAny.from("chat_messages").select("id, sender_id").in("id", itemTradeLastMsgIds);
    for (const row of lastRows ?? []) {
      const id = (row as { id?: string }).id;
      const sid = (row as { sender_id?: string }).sender_id;
      if (typeof id === "string" && typeof sid === "string") senderByLastMessageId.set(id, sid);
    }
  }

  if (roomIds.length > 0) {
    for (const p of parts as {
      room_id: string;
      unread_count?: number;
      last_read_message_id?: string | null;
    }[]) {
      const c = p.unread_count ?? 0;
      const meta = metaByRoom.get(p.room_id) as CrMeta | undefined;
      if (!roomEligibleForUnread(meta)) continue;
      const rt = meta?.room_type ?? "";
      if (rt === "store_order") {
        storeOrderParticipantUnread += c;
      } else if (rt === "item_trade") {
        if (meta?.item_id && meta?.seller_id && meta?.buyer_id) {
          linkedKeys.add(`${meta.item_id}|${meta.seller_id}|${meta.buyer_id}`);
        }
        const cmLinked = String(meta?.community_messenger_room_id ?? "").trim();
        if (cmLinked) {
          /** 통합 메신저 방 unread 는 `community_messenger_participants` 합에만 포함 — 하단 메신저 탭이 `+ chatUnread` 할 때 이중 집계 방지 */
          continue;
        }
        const lastMid = meta?.last_message_id ?? null;
        const lastSender = lastMid ? senderByLastMessageId.get(lastMid) ?? null : null;
        const lastMsgResolvable = !lastMid || senderByLastMessageId.has(lastMid);
        itemTradeParticipantUnread += tradeListUnreadHintFromCursor({
          viewerUserId: userId,
          lastMessageId: lastMid,
          lastMessageSenderId: lastSender,
          lastReadMessageId: p.last_read_message_id ?? null,
          lastMessageRowResolvable: lastMsgResolvable,
        });
      } else if (rt) {
        communityParticipantUnread += c;
      }
      /* room 행 없음(삭제됨)·room_type 비어 있음 → 미읽음 무시 — 삭제된 테스트 방 뱃지 유령 방지 */
    }
  }

  let productChatUnreadDeduped = 0;
  const { data: pcRows, error: pcErr } = pcRes;

  if (!pcErr && pcRows?.length) {
    for (const r of pcRows as {
      post_id: string;
      seller_id: string;
      buyer_id: string;
      unread_count_seller?: number;
      unread_count_buyer?: number;
    }[]) {
      const key = `${r.post_id}|${r.seller_id}|${r.buyer_id}`;
      if (linkedKeys.has(key)) continue;
      const amISeller = r.seller_id === userId;
      productChatUnreadDeduped += amISeller ? (r.unread_count_seller ?? 0) : (r.unread_count_buyer ?? 0);
    }
  }

  return {
    storeOrderParticipantUnread,
    itemTradeParticipantUnread,
    communityParticipantUnread,
    productChatUnreadDeduped,
  };
}

/**
 * 짧은 TTL 런타임 캐시.
 * 동일 사용자의 배지 API가 짧은 간격으로 연달아 들어올 때 DB 왕복을 줄입니다.
 */
export function getCachedUserChatUnreadParts(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<UserChatUnreadParts> {
  const cacheKey = userId.trim();
  if (!cacheKey) {
    return computeUserChatUnreadParts(sbAny, userId);
  }

  const now = Date.now();
  const cached = unreadPartsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }

  const existingFlight = unreadPartsFlights.get(cacheKey);
  if (existingFlight) {
    return existingFlight;
  }

  pruneExpiredUnreadCache(now);

  const flight = computeUserChatUnreadParts(sbAny, cacheKey)
    .then((value) => {
      unreadPartsCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + UNREAD_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      if (unreadPartsFlights.get(cacheKey) === flight) {
        unreadPartsFlights.delete(cacheKey);
      }
    });

  unreadPartsFlights.set(cacheKey, flight);
  return flight;
}

export function sumUserChatUnread(parts: UserChatUnreadParts): number {
  return (
    parts.storeOrderParticipantUnread +
    parts.itemTradeParticipantUnread +
    parts.communityParticipantUnread +
    parts.productChatUnreadDeduped
  );
}

export function sumSocialChatUnread(parts: UserChatUnreadParts): number {
  return (
    parts.itemTradeParticipantUnread +
    parts.communityParticipantUnread +
    parts.productChatUnreadDeduped
  );
}

/** `/chats` 거래 목록·하단 「채팅」탭(거래 범위)과 동일 — item_trade 참가 + product_chats(통합방 미연동분) */
export function sumTradeChatUnread(parts: UserChatUnreadParts): number {
  return parts.itemTradeParticipantUnread + parts.productChatUnreadDeduped;
}
