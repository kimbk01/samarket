/**
 * 사용자 기준 채팅 미읽음 — product_chats 와 chat_rooms(item_trade) 동시 존재 시 이중 집계 방지.
 * - store_order / 기타 chat_rooms: 참가자 `unread_count` 합산
 * - item_trade: `last_message_id`·`last_read_message_id` 기준 `tradeListUnreadHintFromCursor`(0/1) 합산 — `unread_count` 미사용
 * - `item_trade` + `community_messenger_room_id`: 메신저 참가자 unread 가 진실이므로 여기서 힌트 합산 제외(하단 메신저 탭 `+ communityMessengerUnread` 이중 방지)
 * - product_chats: 동일 거래에 item_trade 통합방이 있으면 스킵(통합방 힌트만 반영)
 *
 * Cold hub badge: `hub_badge_user_chat_unread_parts` RPC (migration 20260519120000) — multi-query TS fallback only on RPC miss.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { tradeListUnreadHintFromCursor } from "@/lib/chats/server/trade-list-unread-hint";
import {
  HUB_BADGE_UNREAD_COUNTERS_TABLE,
  hubBadgeUnreadCounterTtlMs,
  isHubBadgeUnreadCounterAuditEnabled,
  readHubBadgeUnreadCounter,
  unreadPartsEqual,
  upsertHubBadgeUnreadCounter,
} from "@/lib/chat/hub-badge-unread-counter";
import {
  hubBadgeUnreadPartsMemoryTtlMs,
  invalidateHubBadgeUnreadPartsMemory,
  readHubBadgeUnreadPartsMemory,
  writeHubBadgeUnreadPartsMemory,
} from "@/lib/chat/hub-badge-unread-parts-memory-cache";

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

export type UnreadPartsQueryStepLog = {
  query_name: string;
  table: string;
  total_ms: number;
  rows?: number;
  room_count?: number;
  uses_rpc?: 0 | 1;
  uses_count?: 0 | 1;
  uses_join?: 0 | 1;
  index_hint_possible?: string;
  cache_hit_reason?: string;
};

export type UnreadPartsComputeVia = "memory" | "counter" | "rpc" | "legacy";

const unreadPartsFlights = new Map<string, Promise<UserChatUnreadParts>>();

/** invalidate 직후 counter read-through 스킵 — hub badge TTL(5s)과 맞춤 */
const counterBypassUntil = new Map<string, number>();

/** 마지막 cold 계산 구간 계측 — route-perf `unread_parts_ms` 연동 */
let lastUnreadPartsComputeMeta: {
  total_ms: number;
  via: UnreadPartsComputeVia;
  steps: UnreadPartsQueryStepLog[];
  unread_counter_hit?: 0 | 1;
  unread_counter_age_ms?: number;
  unread_counter_refresh_ms?: number;
  unread_parts_rpc_ms?: number;
  unread_memory_hit?: 0 | 1;
  unread_memory_age_ms?: number;
} | null = null;

export function peekLastUnreadPartsComputeMeta() {
  return lastUnreadPartsComputeMeta;
}

/** 읽음 API 직후 배지 계산이 바로 새 값을 보도록 */
export function invalidateUserChatUnreadCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidateHubBadgeUnreadPartsMemory(k);
  counterBypassUntil.set(k, Date.now() + hubBadgeUnreadCounterTtlMs());
}

function logUnreadPartsMemoryHit(userId: string, ageMs: number, totalMs: number): void {
  lastUnreadPartsComputeMeta = {
    total_ms: totalMs,
    via: "memory",
    steps: [
      {
        query_name: "hub_badge_unread_parts_memory",
        table: "memory",
        total_ms: totalMs,
        cache_hit_reason: "unread_parts_memory_ttl",
      },
    ],
    unread_memory_hit: 1,
    unread_memory_age_ms: Math.round(ageMs),
    unread_counter_hit: 0,
    unread_counter_refresh_ms: 0,
    unread_parts_rpc_ms: 0,
  };
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- TTL 내 counter DB 생략
    console.info("[hub-badge-unread-parts-memory-hit]", {
      user_id_short: userId.slice(0, 8),
      unread_memory_age_ms: Math.round(ageMs),
      ttl_ms: hubBadgeUnreadPartsMemoryTtlMs(),
      stale_snapshot_within_ttl: true,
    });
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

const HUB_BADGE_UNREAD_PARTS_RPC = "hub_badge_user_chat_unread_parts";

function mapRpcUnreadPartsPayload(data: unknown): UserChatUnreadParts | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    storeOrderParticipantUnread: Math.max(0, Number(d.store_order_participant_unread) || 0),
    itemTradeParticipantUnread: Math.max(0, Number(d.item_trade_participant_unread) || 0),
    communityParticipantUnread: Math.max(0, Number(d.community_participant_unread) || 0),
    productChatUnreadDeduped: Math.max(0, Number(d.product_chat_unread_deduped) || 0),
  };
}

function logUnreadPartsSteps(
  steps: UnreadPartsQueryStepLog[],
  via: UnreadPartsComputeVia,
  totalMs: number,
  extra?: Partial<Omit<NonNullable<typeof lastUnreadPartsComputeMeta>, "total_ms" | "via" | "steps">>
) {
  lastUnreadPartsComputeMeta = { total_ms: totalMs, via, steps, ...extra };
  if (process.env.NODE_ENV !== "development") return;
  for (const s of steps) {
    // eslint-disable-next-line no-console -- dev cold-path breakdown
    console.info("[unread-parts-query]", s);
  }
}

async function computeUserChatUnreadPartsViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { skipMetaLog?: boolean }
): Promise<UserChatUnreadParts | null> {
  const t0 = Date.now();
  const { data, error } = await sbAny.rpc(HUB_BADGE_UNREAD_PARTS_RPC, {
    p_user_id: userId,
  });
  const totalMs = Date.now() - t0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev RPC deploy probe
      console.warn("[unread-parts-rpc-miss]", error.message);
    }
    return null;
  }
  const mapped = mapRpcUnreadPartsPayload(data);
  if (!mapped) return null;
  if (!opts?.skipMetaLog) {
    logUnreadPartsSteps(
      [
        {
          query_name: HUB_BADGE_UNREAD_PARTS_RPC,
          table: "chat_room_participants+chat_rooms+product_chats",
          total_ms: totalMs,
          uses_rpc: 1,
          uses_join: 1,
          index_hint_possible: "idx_chat_room_participants_user_visible_active",
          cache_hit_reason: "rpc_cold",
        },
      ],
      "rpc",
      totalMs
    );
  }
  return mapped;
}

async function auditHubBadgeUnreadCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  counterParts: UserChatUnreadParts
): Promise<void> {
  if (!isHubBadgeUnreadCounterAuditEnabled()) return;
  try {
    const rpcParts = await computeUserChatUnreadPartsViaRpc(sbAny, userId, { skipMetaLog: true });
    if (!rpcParts) return;
    if (!unreadPartsEqual(counterParts, rpcParts)) {
      // eslint-disable-next-line no-console -- dev counter audit
      console.warn("[hub-badge-unread-counter-mismatch]", {
        user_id_short: userId.slice(0, 8),
        counter: counterParts,
        rpc: rpcParts,
      });
    }
  } catch {
    /* audit only */
  }
}

async function timedQuery<T>(
  steps: UnreadPartsQueryStepLog[],
  step: Omit<UnreadPartsQueryStepLog, "total_ms"> & { run: () => Promise<T> }
): Promise<T> {
  const t0 = Date.now();
  const result = await step.run();
  steps.push({
    query_name: step.query_name,
    table: step.table,
    total_ms: Date.now() - t0,
    rows: step.rows,
    room_count: step.room_count,
    uses_rpc: step.uses_rpc ?? 0,
    uses_count: step.uses_count ?? 0,
    uses_join: step.uses_join ?? 0,
    index_hint_possible: step.index_hint_possible,
    cache_hit_reason: step.cache_hit_reason,
  });
  return result;
}

/** Legacy multi-query path — RPC 미배포·실패 시에만 */
export async function computeUserChatUnreadPartsLegacy(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<UserChatUnreadParts> {
  const steps: UnreadPartsQueryStepLog[] = [];
  const tAll = Date.now();

  const [partRows, pcRows] = await Promise.all([
    timedQuery(steps, {
      query_name: "participants_by_user",
      table: "chat_room_participants",
      uses_join: 0,
      index_hint_possible: "idx_chat_room_participants_user_visible_active",
      cache_hit_reason: "legacy_cold",
      run: async () => {
        const { data, error } = await sbAny
          .from("chat_room_participants")
          .select("room_id, unread_count, last_read_message_id, hidden, left_at, is_active")
          .eq("user_id", userId)
          .eq("hidden", false);
        if (error) throw error;
        return data ?? [];
      },
    }),
    timedQuery(steps, {
      query_name: "product_chats_by_seller_or_buyer",
      table: "product_chats",
      uses_join: 0,
      index_hint_possible: "idx_product_chats_seller_last_at,idx_product_chats_buyer_last_at",
      run: async () => {
        const { data, error } = await sbAny
          .from("product_chats")
          .select("post_id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
          .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);
        if (error) throw error;
        return data ?? [];
      },
    }),
  ]);

  const partsRaw = partRows as {
    room_id: string;
    unread_count?: number;
    last_read_message_id?: string | null;
    hidden?: boolean;
    left_at?: string | null;
    is_active?: boolean | null;
  }[];
  const parts = partsRaw.filter((p) => participantRowActive(p));
  const roomIds = [...new Set(parts.map((p) => p.room_id).filter(Boolean))];

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
    community_messenger_room_id?: string | null;
    lm?: { sender_id?: string | null } | Array<{ sender_id?: string | null }> | null;
  };

  const crRowsFlat = await timedQuery(steps, {
    query_name: "chat_rooms_by_participant_ids",
    table: "chat_rooms",
    room_count: roomIds.length,
    uses_join: 1,
    index_hint_possible: "chat_rooms_pkey",
    run: async () => {
      if (roomIds.length === 0) return [] as CrMeta[];
      const batch = await Promise.all(
        chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE).map(async (ids) => {
          const { data, error } = await sbAny
            .from("chat_rooms")
            .select(
              "id, room_type, item_id, seller_id, buyer_id, is_locked, last_message_id, community_messenger_room_id, lm:chat_messages!last_message_id ( sender_id )"
            )
            .in("id", ids);
          if (error) return [];
          return (data ?? []) as CrMeta[];
        })
      );
      return batch.flat();
    },
  });

  const crRows: CrMeta[] = crRowsFlat;
  const metaByRoom = new Map(crRows.map((r) => [r.id, r]));

  function lastMessageSenderFromEmbed(
    row: CrMeta,
    lastMessageId: string | null
  ): { senderId: string | null; resolvable: boolean } {
    if (!lastMessageId) return { senderId: null, resolvable: true };
    const lm = row.lm;
    const embedded = Array.isArray(lm) ? lm[0] : lm;
    if (!embedded) return { senderId: null, resolvable: false };
    const sid = (embedded.sender_id ?? "").trim();
    return { senderId: sid || null, resolvable: true };
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
        if (cmLinked) continue;
        const lastMid = meta?.last_message_id ?? null;
        const { senderId: lastSender, resolvable: lastMsgResolvable } = lastMessageSenderFromEmbed(
          meta as CrMeta,
          lastMid
        );
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
    }
  }

  let productChatUnreadDeduped = 0;
  if (pcRows?.length) {
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

  const value = {
    storeOrderParticipantUnread,
    itemTradeParticipantUnread,
    communityParticipantUnread,
    productChatUnreadDeduped,
  };
  logUnreadPartsSteps(steps, "legacy", Date.now() - tAll);
  return value;
}

async function computeUserChatUnreadPartsFromRpcOrLegacy(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<{ value: UserChatUnreadParts; via: "rpc" | "legacy"; rpcMs: number }> {
  const rpc0 = Date.now();
  const viaRpc = await computeUserChatUnreadPartsViaRpc(sbAny, userId, { skipMetaLog: true });
  const rpcMs = Date.now() - rpc0;
  if (viaRpc) {
    logUnreadPartsSteps(
      [
        {
          query_name: HUB_BADGE_UNREAD_PARTS_RPC,
          table: "chat_room_participants+chat_rooms+product_chats",
          total_ms: rpcMs,
          uses_rpc: 1,
          uses_join: 1,
          index_hint_possible: "idx_chat_room_participants_user_visible_active",
          cache_hit_reason: "rpc_refresh",
        },
      ],
      "rpc",
      rpcMs,
      { unread_counter_hit: 0, unread_parts_rpc_ms: rpcMs, unread_counter_refresh_ms: rpcMs }
    );
    return { value: viaRpc, via: "rpc", rpcMs };
  }
  const legacy0 = Date.now();
  const legacy = await computeUserChatUnreadPartsLegacy(sbAny, userId);
  const legacyMs = Date.now() - legacy0;
  if (lastUnreadPartsComputeMeta) {
    lastUnreadPartsComputeMeta.unread_counter_hit = 0;
    lastUnreadPartsComputeMeta.unread_parts_rpc_ms = rpcMs;
    lastUnreadPartsComputeMeta.unread_counter_refresh_ms = legacyMs;
  }
  return { value: legacy, via: "legacy", rpcMs };
}

export async function computeUserChatUnreadParts(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<UserChatUnreadParts> {
  const cacheKey = userId.trim();
  const total0 = Date.now();
  const bypass = Boolean(
    cacheKey && (counterBypassUntil.get(cacheKey) ?? 0) > Date.now()
  );

  const counterRead = await readHubBadgeUnreadCounter(sbAny, cacheKey, { bypass });
  if (counterRead.hit) {
    const totalMs = Date.now() - total0;
    logUnreadPartsSteps(
      [
        {
          query_name: "hub_badge_user_unread_counters",
          table: HUB_BADGE_UNREAD_COUNTERS_TABLE,
          total_ms: totalMs,
          cache_hit_reason: "counter_hit",
          index_hint_possible: "hub_badge_user_unread_counters_pkey",
        },
      ],
      "counter",
      totalMs,
      {
        unread_counter_hit: 1,
        unread_counter_age_ms: counterRead.ageMs,
        unread_counter_refresh_ms: 0,
        unread_parts_rpc_ms: 0,
      }
    );
    void auditHubBadgeUnreadCounter(sbAny, cacheKey, counterRead.parts);
    writeHubBadgeUnreadPartsMemory(cacheKey, counterRead.parts);
    return counterRead.parts;
  }

  const refreshed = await computeUserChatUnreadPartsFromRpcOrLegacy(sbAny, userId);
  const refreshWall = Date.now() - total0;
  if (lastUnreadPartsComputeMeta) {
    lastUnreadPartsComputeMeta.total_ms = refreshWall;
    lastUnreadPartsComputeMeta.unread_counter_refresh_ms =
      lastUnreadPartsComputeMeta.unread_counter_refresh_ms ?? refreshed.rpcMs;
  }
  void upsertHubBadgeUnreadCounter(sbAny, cacheKey, refreshed.value);
  writeHubBadgeUnreadPartsMemory(cacheKey, refreshed.value);
  if (cacheKey && counterBypassUntil.get(cacheKey)) {
    counterBypassUntil.delete(cacheKey);
  }
  return refreshed.value;
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

  const mem0 = Date.now();
  const mem = readHubBadgeUnreadPartsMemory(cacheKey);
  if (mem.hit) {
    logUnreadPartsMemoryHit(cacheKey, mem.ageMs, Date.now() - mem0);
    return Promise.resolve(mem.parts);
  }

  const existingFlight = unreadPartsFlights.get(cacheKey);
  if (existingFlight) {
    return existingFlight;
  }

  const flight = computeUserChatUnreadParts(sbAny, cacheKey)
    .then((value) => value)
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
