/**
 * 메신저 방에서 읽음 처리할 때, `community_messenger_room_id`로 묶인 `item_trade` 행과
 * `product_chats` 미읽음을 같이 맞춘다. 그렇지 않으면 `tradeListUnreadHintFromCursor`·PC 카운트가
 * 남아 탭/목록 병합 뱃지가 사라지지 않는다.
 *
 * CM 메시지 id 와 `chat_messages` id 는 다르다. `communityMessengerLastReadMessageId` 가 있으면
 * CM 행 시각 기준으로 원장에 대응되는 `chat_messages` 커서를 고르고, CM 이 원장 꼬리 이상으로
 * 읽혔으면 `chat_rooms.last_message_id` 로 맞춘다.
 *
 * 스코프: **해당 CM에 연결된 `item_trade` `chat_rooms` 행만** — 전역 unread 재계산이 아니다.
 *
 * @see app/api/chat/rooms/[roomId]/read/route.ts — 동일한 participant·메시지·PC 갱신 의미
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

function trimId(value: unknown): string {
  return String(value ?? "").trim();
}

/** `mark_read` 직후 item_trade 브리지 동기화 분해 — 배경 실행 로그·계측용 */
export type ItemTradeSyncWithMessengerMarkDiag = {
  registry_sync_total_ms?: number;
  registry_sync_db_ms?: number;
  registry_sync_rpc_ms?: number;
  registry_sync_unread_recalc_ms?: number;
  registry_sync_meta_fallback_ms?: number;
  registry_sync_cache_invalidate_ms?: number;
  registry_sync_top_bottleneck?: string;
  registry_sync_top_bottleneck_ms?: number;

  unread_recalc_total_ms?: number;
  unread_recalc_room_fetch_ms?: number;
  unread_recalc_message_fetch_ms?: number;
  unread_recalc_participant_fetch_ms?: number;
  unread_recalc_count_query_ms?: number;
  unread_recalc_participant_update_ms?: number;
  unread_recalc_messages_read_at_ms?: number;
  unread_recalc_product_chats_ms?: number;
  unread_recalc_resolve_cursor_ms?: number;
  unread_recalc_cpu_ms?: number;
  unread_recalc_query_count?: number;
  unread_recalc_room_count?: number;
  unread_recalc_top_bottleneck?: string;
  unread_recalc_top_bottleneck_ms?: number;

  meta_fallback_total_ms?: number;
  meta_fallback_room_lookup_ms?: number;
  meta_fallback_trade_lookup_ms?: number;
  meta_fallback_post_lookup_ms?: number;
  meta_fallback_product_lookup_ms?: number;
  meta_fallback_product_update_ms?: number;
  meta_fallback_cpu_ms?: number;
  meta_fallback_query_count?: number;
  meta_fallback_top_bottleneck?: string;
  meta_fallback_top_bottleneck_ms?: number;

  /** 동일 user·CM·cursor 로 직전 성공 실행이 TTL 내면 전체 스킵 */
  registry_background_dedupe_hit?: 0 | 1;
  registry_background_skipped_reason?: string;
  registry_background_inflight_key?: string;
  /** CM 메시지·`chat_messages` 커서 `created_at` 캐시 히트 횟수(관측) */
  registry_background_cache_hit?: number;

  /**
   * 이 브리지에는 unread 용도의 단독 COUNT(*) 왕복이 없다.
   * 과거 `unread_recalc_count_query_ms`에 participant UPDATE + read_at UPDATE 벽시계가 합산돼
   * “count query”로 오기재됐다 — 아래 필드로 실제 역할을 분리한다.
   */
  unread_count_query_mode?: "none";
  unread_count_query_rows?: number;
  unread_count_query_index_hint?: "n/a";
  unread_count_query_repeat_state?: string;
  /** read_at 대상 1건 선검사(probe) 후 UPDATE 생략한 room 수 */
  unread_count_query_zero_skip?: number;
  unread_recalc_participant_prefetch_ms?: number;
  unread_read_at_probe_ms?: number;
  unread_participant_update_skip?: number;
  unread_read_at_update_skip?: number;
  meta_fallback_room_cache_hit?: 0 | 1;
  meta_fallback_pc_lookup_cache_hit?: 0 | 1;
  meta_fallback_product_update_skip?: 0 | 1;
};

const CM_MSG_CREATED_AT_TTL_MS = 10_000;
const CHAT_MSG_CREATED_AT_TTL_MS = 10_000;
const IDENTICAL_SYNC_COOLDOWN_MS = 5_000;
const CACHE_MAX_KEYS = 2_000;
const CM_ROOM_SUMMARY_CACHE_TTL_MS = 10_000;

const cmMessageCreatedAtCache = new Map<string, { exp: number; created_at: string }>();
const chatMessageCreatedAtCache = new Map<string, { exp: number; created_at: string }>();
const identicalSyncCooldown = new Map<string, number>();
const cmRoomSummaryCache = new Map<string, { exp: number; summary: string | null }>();

function pruneIdenticalSyncCooldown(now: number): void {
  if (identicalSyncCooldown.size < 600) return;
  const cutoff = now - IDENTICAL_SYNC_COOLDOWN_MS * 4;
  for (const [k, t] of identicalSyncCooldown) {
    if (t < cutoff) identicalSyncCooldown.delete(k);
  }
}

function pruneIdCache(map: Map<string, { exp: number; created_at: string }>, now: number): void {
  if (map.size <= CACHE_MAX_KEYS) return;
  for (const [k, v] of map) {
    if (v.exp < now || map.size <= CACHE_MAX_KEYS * 0.75) map.delete(k);
  }
}

function cacheKeyTwo(a: string, b: string): string {
  return `${a}\0${b}`;
}

function getCachedCreatedAt(
  map: Map<string, { exp: number; created_at: string }>,
  key: string,
  now: number
): string | null {
  const e = map.get(key);
  if (!e || e.exp < now) return null;
  return e.created_at;
}

function setCachedCreatedAt(
  map: Map<string, { exp: number; created_at: string }>,
  key: string,
  created_at: string,
  now: number,
  ttlMs: number
): void {
  map.set(key, { exp: now + ttlMs, created_at });
  pruneIdCache(map, now);
}

function setCmRoomSummaryCacheEntry(cmId: string, summary: string | null, clockMs: number): void {
  cmRoomSummaryCache.set(cmId, { exp: clockMs + CM_ROOM_SUMMARY_CACHE_TTL_MS, summary });
  if (cmRoomSummaryCache.size > CACHE_MAX_KEYS) {
    for (const [k, v] of cmRoomSummaryCache) {
      if (v.exp < clockMs || cmRoomSummaryCache.size <= CACHE_MAX_KEYS * 0.75) cmRoomSummaryCache.delete(k);
    }
  }
}

function normLastReadMessageId(id: string | null | undefined): string {
  return trimId(id) || "";
}

async function resolveItemTradeLastReadMessageIdForMessengerMark(
  sbAny: SupabaseClient<any>,
  args: {
    itemTradeRoomId: string;
    cmRoomId: string;
    cmLastReadMessageId: string | null;
    chatRoomsLastMessageId: string | null;
    /** 스케줄러가 이미 알고 있는 CM 메시지 시각 — 있으면 CM `created_at` 조회 생략 */
    knownCmMessageCreatedAt?: string | null;
  },
  timing?: {
    addQueryMs: (ms: number) => void;
    addQueries: (n: number) => void;
  },
  cacheHits?: { n: number }
): Promise<string | null> {
  const tailId = trimId(args.chatRoomsLastMessageId) || null;
  const cmMid = trimId(args.cmLastReadMessageId) || null;
  if (!cmMid) return tailId;

  const q = timing?.addQueries ?? ((_n: number) => {});
  const addMs = timing?.addQueryMs ?? ((_ms: number) => {});

  const nowMs = Date.now();
  const cmKey = cacheKeyTwo(args.cmRoomId, cmMid);
  const knownFromCaller = trimId(args.knownCmMessageCreatedAt) || "";
  const cachedCmCreated =
    knownFromCaller || getCachedCreatedAt(cmMessageCreatedAtCache, cmKey, nowMs);

  const t0 = devPerfNow();
  let cmCreated: string;
  let tailPack: { data: { created_at?: string } | null };

  if (cachedCmCreated) {
    cmCreated = cachedCmCreated;
    if (tailId) {
      tailPack = await sbAny.from("chat_messages").select("created_at").eq("id", tailId).maybeSingle();
    } else {
      tailPack = { data: null };
    }
    addMs(devPerfNow() - t0);
    q(tailId ? 1 : 0);
    if (cacheHits) cacheHits.n += 1;
    const tailRow = tailPack.data as { created_at?: string } | null;
    const tailCr = typeof tailRow?.created_at === "string" ? tailRow.created_at.trim() : "";
    if (tailId && tailCr) {
      setCachedCreatedAt(chatMessageCreatedAtCache, tailId, tailCr, nowMs, CHAT_MSG_CREATED_AT_TTL_MS);
    }
  } else {
    const [cmRes, tailRes] = await Promise.all([
      sbAny
        .from("community_messenger_messages")
        .select("created_at")
        .eq("room_id", args.cmRoomId)
        .eq("id", cmMid)
        .maybeSingle(),
      tailId
        ? sbAny.from("chat_messages").select("created_at").eq("id", tailId).maybeSingle()
        : Promise.resolve({ data: null as { created_at?: string } | null }),
    ]);
    tailPack = tailRes;
    addMs(devPerfNow() - t0);
    q(2);
    const cmRow = cmRes.data as { created_at?: string } | null;
    const raw = cmRow?.created_at;
    cmCreated = typeof raw === "string" ? raw.trim() : "";
    if (cmCreated) {
      setCachedCreatedAt(cmMessageCreatedAtCache, cmKey, cmCreated, nowMs, CM_MSG_CREATED_AT_TTL_MS);
    }
    const tailRow = tailPack.data as { created_at?: string } | null;
    const tailCr = typeof tailRow?.created_at === "string" ? tailRow.created_at.trim() : "";
    if (tailId && tailCr) {
      setCachedCreatedAt(chatMessageCreatedAtCache, tailId, tailCr, nowMs, CHAT_MSG_CREATED_AT_TTL_MS);
    }
  }

  if (!cmCreated) return tailId;

  if (tailId) {
    const tailRow = tailPack.data as { created_at?: string } | null;
    const tailCreatedRaw = tailRow?.created_at;
    const tailCreated = typeof tailCreatedRaw === "string" ? tailCreatedRaw.trim() : "";
    if (tailCreated && cmCreated >= tailCreated) return tailId;
  }

  const t1 = devPerfNow();
  const { data: atOrBefore } = await sbAny
    .from("chat_messages")
    .select("id")
    .eq("room_id", args.itemTradeRoomId)
    .lte("created_at", cmCreated)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  addMs(devPerfNow() - t1);
  q(1);

  const bridged = trimId((atOrBefore as { id?: unknown } | null)?.id) || null;
  return bridged ?? tailId;
}

function applyItemTradeSyncDiag(
  diag: ItemTradeSyncWithMessengerMarkDiag,
  args: {
    tAll: number;
    dbWallMs: number;
    loopWallMs: number;
    metaWallMs: number;
    cacheWallMs: number;
    rowsLen: number;
    unreadQueryCount: number;
    metaQueryCount: number;
    unreadResolveMs: number;
    unreadMessageFetchMs: number;
    unreadParticipantUpdateMs: number;
    unreadMessagesReadAtMs: number;
    unreadProductChatsMs: number;
    unreadParticipantPrefetchMs: number;
    unreadReadAtProbeMs: number;
    participantUpdateSkips: number;
    readAtUpdateSkips: number;
    readAtProbeZeroSkips: number;
    readAtUpdatesExecuted: number;
    metaRoomLookupMs: number;
    metaParseMs: number;
    metaProductLookupMs: number;
    metaProductUpdateMs: number;
    metaRoomCacheHit: 0 | 1;
    metaPcLookupCacheHit: 0 | 1;
    metaProductUpdateSkipped: 0 | 1;
  }
): void {
  const {
    tAll,
    dbWallMs,
    loopWallMs,
    metaWallMs,
    cacheWallMs,
    rowsLen,
    unreadQueryCount,
    metaQueryCount,
    unreadResolveMs,
    unreadMessageFetchMs,
    unreadParticipantUpdateMs,
    unreadMessagesReadAtMs,
    unreadProductChatsMs,
    unreadParticipantPrefetchMs,
    unreadReadAtProbeMs,
    participantUpdateSkips,
    readAtUpdateSkips,
    readAtProbeZeroSkips,
    readAtUpdatesExecuted,
    metaRoomLookupMs,
    metaParseMs,
    metaProductLookupMs,
    metaProductUpdateMs,
    metaRoomCacheHit,
    metaPcLookupCacheHit,
    metaProductUpdateSkipped,
  } = args;

  const measuredLoop =
    unreadParticipantPrefetchMs +
    unreadReadAtProbeMs +
    unreadResolveMs +
    unreadMessageFetchMs +
    unreadParticipantUpdateMs +
    unreadMessagesReadAtMs +
    unreadProductChatsMs;
  const unreadCpu = Math.max(0, loopWallMs - measuredLoop);

  diag.unread_recalc_room_fetch_ms = Math.round(dbWallMs);
  diag.unread_recalc_message_fetch_ms = Math.round(unreadMessageFetchMs);
  diag.unread_recalc_participant_fetch_ms = 0;
  /** 단독 COUNT(*) 왕복 없음 — 0 고정 (과거에는 participant+read_at 합이 잘못 기록됨) */
  diag.unread_recalc_count_query_ms = 0;
  diag.unread_count_query_mode = "none";
  diag.unread_count_query_rows = readAtUpdatesExecuted;
  diag.unread_count_query_index_hint = "n/a";
  diag.unread_count_query_repeat_state =
    participantUpdateSkips > 0 ? "participant_last_read_noop" : "participant_updates_ran";
  diag.unread_count_query_zero_skip = readAtProbeZeroSkips;
  diag.unread_recalc_participant_prefetch_ms = Math.round(unreadParticipantPrefetchMs);
  diag.unread_read_at_probe_ms = Math.round(unreadReadAtProbeMs);
  diag.unread_participant_update_skip = participantUpdateSkips;
  diag.unread_read_at_update_skip = readAtUpdateSkips;
  diag.meta_fallback_room_cache_hit = metaRoomCacheHit;
  diag.meta_fallback_pc_lookup_cache_hit = metaPcLookupCacheHit;
  diag.meta_fallback_product_update_skip = metaProductUpdateSkipped;
  diag.unread_recalc_participant_update_ms = Math.round(unreadParticipantUpdateMs);
  diag.unread_recalc_messages_read_at_ms = Math.round(unreadMessagesReadAtMs);
  diag.unread_recalc_product_chats_ms = Math.round(unreadProductChatsMs);
  diag.unread_recalc_resolve_cursor_ms = Math.round(unreadResolveMs);
  diag.unread_recalc_cpu_ms = Math.round(unreadCpu);
  diag.unread_recalc_query_count = unreadQueryCount;
  diag.unread_recalc_room_count = rowsLen;
  diag.unread_recalc_total_ms = Math.round(dbWallMs + loopWallMs);

  const urCandidates: Array<[string, number]> = [
    ["unread_recalc_room_fetch_ms", dbWallMs],
    ["unread_recalc_resolve_cursor_ms", unreadResolveMs],
    ["unread_recalc_message_fetch_ms", unreadMessageFetchMs],
    ["unread_recalc_participant_prefetch_ms", unreadParticipantPrefetchMs],
    ["unread_read_at_probe_ms", unreadReadAtProbeMs],
    ["unread_recalc_participant_update_ms", unreadParticipantUpdateMs],
    ["unread_recalc_messages_read_at_ms", unreadMessagesReadAtMs],
    ["unread_recalc_product_chats_ms", unreadProductChatsMs],
    ["unread_recalc_cpu_ms", unreadCpu],
  ];
  let urTop = urCandidates[0][0];
  let urTopMs = urCandidates[0][1];
  for (const [k, v] of urCandidates) {
    if (v > urTopMs) {
      urTop = k;
      urTopMs = v;
    }
  }
  diag.unread_recalc_top_bottleneck = urTop;
  diag.unread_recalc_top_bottleneck_ms = Math.round(urTopMs);

  const metaMeasured = metaRoomLookupMs + metaParseMs + metaProductLookupMs + metaProductUpdateMs;
  const metaCpu = Math.max(0, metaWallMs - metaMeasured);

  diag.meta_fallback_total_ms = Math.round(metaWallMs);
  diag.meta_fallback_room_lookup_ms = Math.round(metaRoomLookupMs);
  diag.meta_fallback_trade_lookup_ms = Math.round(metaParseMs);
  diag.meta_fallback_post_lookup_ms = 0;
  diag.meta_fallback_product_lookup_ms = Math.round(metaProductLookupMs);
  diag.meta_fallback_product_update_ms = Math.round(metaProductUpdateMs);
  diag.meta_fallback_cpu_ms = Math.round(metaCpu);
  diag.meta_fallback_query_count = metaQueryCount;

  const mfCandidates: Array<[string, number]> = [
    ["meta_fallback_room_lookup_ms", metaRoomLookupMs],
    ["meta_fallback_trade_lookup_ms", metaParseMs],
    ["meta_fallback_product_lookup_ms", metaProductLookupMs],
    ["meta_fallback_product_update_ms", metaProductUpdateMs],
  ];
  let mfTop = mfCandidates[0][0];
  let mfTopMs = mfCandidates[0][1];
  for (const [k, v] of mfCandidates) {
    if (v > mfTopMs) {
      mfTop = k;
      mfTopMs = v;
    }
  }
  diag.meta_fallback_top_bottleneck = mfTop;
  diag.meta_fallback_top_bottleneck_ms = Math.round(mfTopMs);

  const total = Math.round(devPerfNow() - tAll);
  const dbMs = Math.round(dbWallMs);
  const loopMs = Math.round(loopWallMs);
  const metaMs = Math.round(metaWallMs);
  const cacheMs = Math.round(cacheWallMs);
  diag.registry_sync_total_ms = total;
  diag.registry_sync_db_ms = dbMs;
  diag.registry_sync_rpc_ms = 0;
  diag.registry_sync_unread_recalc_ms = loopMs;
  diag.registry_sync_meta_fallback_ms = metaMs;
  diag.registry_sync_cache_invalidate_ms = cacheMs;
  const candidates: Array<[string, number]> = [
    ["registry_sync_db_ms", dbMs],
    ["registry_sync_unread_recalc_ms", loopMs],
    ["registry_sync_meta_fallback_ms", metaMs],
    ["registry_sync_cache_invalidate_ms", cacheMs],
  ];
  let top = candidates[0][0];
  let topMs = candidates[0][1];
  for (const [k, v] of candidates) {
    if (v > topMs) {
      top = k;
      topMs = v;
    }
  }
  diag.registry_sync_top_bottleneck = top;
  diag.registry_sync_top_bottleneck_ms = topMs;
}

export async function syncItemTradeReadWithMessengerRoomMark(
  sbAny: SupabaseClient<any>,
  input: {
    userId: string;
    communityMessengerRoomId: string;
    communityMessengerLastReadMessageId?: string | null;
    /** 있으면 CM `community_messenger_messages.created_at` 조회 생략(스케줄·캐시와 동일 값만) */
    communityMessengerLastReadMessageCreatedAt?: string | null;
  },
  diag?: ItemTradeSyncWithMessengerMarkDiag
): Promise<void> {
  const tAll = devPerfNow();
  let dbWallMs = 0;
  let loopWallMs = 0;
  let metaWallMs = 0;
  let cacheWallMs = 0;

  let unreadQueryCount = 0;
  let unreadResolveMs = 0;
  let unreadParticipantUpdateMs = 0;
  let unreadMessagesReadAtMs = 0;
  let unreadProductChatsMs = 0;
  let unreadMessageFetchMs = 0;

  let metaQueryCount = 0;
  let metaRoomLookupMs = 0;
  let metaParseMs = 0;
  let metaProductLookupMs = 0;
  let metaProductUpdateMs = 0;

  const uid = trimId(input.userId);
  const cmId = trimId(input.communityMessengerRoomId);
  const cmCursor = trimId(input.communityMessengerLastReadMessageId) || null;
  if (!uid || !cmId) return;

  const nowDedupe = Date.now();
  pruneIdenticalSyncCooldown(nowDedupe);
  const syncIdentityKey = `${uid}\0${cmId}\0${cmCursor ?? "__open__"}`;
  const lastIdenticalAt = identicalSyncCooldown.get(syncIdentityKey);
  if (lastIdenticalAt != null && nowDedupe - lastIdenticalAt < IDENTICAL_SYNC_COOLDOWN_MS) {
    if (diag) {
      diag.registry_background_dedupe_hit = 1;
      diag.registry_background_skipped_reason = "identical_bridge_recent_ttl";
      diag.registry_background_inflight_key = syncIdentityKey;
      diag.registry_background_cache_hit = 0;
      applyItemTradeSyncDiag(diag, {
        tAll,
        dbWallMs: 0,
        loopWallMs: 0,
        metaWallMs: 0,
        cacheWallMs: 0,
        rowsLen: 0,
        unreadQueryCount: 0,
        metaQueryCount: 0,
        unreadResolveMs: 0,
        unreadMessageFetchMs: 0,
        unreadParticipantUpdateMs: 0,
        unreadMessagesReadAtMs: 0,
        unreadProductChatsMs: 0,
        unreadParticipantPrefetchMs: 0,
        unreadReadAtProbeMs: 0,
        participantUpdateSkips: 0,
        readAtUpdateSkips: 0,
        readAtProbeZeroSkips: 0,
        readAtUpdatesExecuted: 0,
        metaRoomLookupMs: 0,
        metaParseMs: 0,
        metaProductLookupMs: 0,
        metaProductUpdateMs: 0,
        metaRoomCacheHit: 0,
        metaPcLookupCacheHit: 0,
        metaProductUpdateSkipped: 0,
      });
    }
    return;
  }

  const cacheHits = { n: 0 };

  let metaRoomCacheHit: 0 | 1 = 0;

  const roomsPromise = (async () => {
    const t = devPerfNow();
    const r = await sbAny
      .from("chat_rooms")
      .select("id, last_message_id, item_id, seller_id, buyer_id")
      .eq("room_type", "item_trade")
      .eq("community_messenger_room_id", cmId);
    unreadQueryCount += 1;
    return { ...r, _ms: devPerfNow() - t };
  })();

  const cmSummaryPromise = (async () => {
    const clockMs = Date.now();
    const cached = cmRoomSummaryCache.get(cmId);
    if (cached && cached.exp >= clockMs) {
      metaRoomCacheHit = 1;
      return {
        data: { summary: cached.summary } as { summary: string | null },
        error: null,
        _ms: 0,
      };
    }
    const t = devPerfNow();
    const r = await sbAny.from("community_messenger_rooms").select("summary").eq("id", cmId).maybeSingle();
    metaQueryCount += 1;
    const ms = devPerfNow() - t;
    const sum = (r.data as { summary?: string | null } | null)?.summary ?? null;
    setCmRoomSummaryCacheEntry(cmId, sum, clockMs);
    return { ...r, _ms: ms };
  })();

  const [roomsPack, cmSummaryPack] = await Promise.all([roomsPromise, cmSummaryPromise]);
  dbWallMs += roomsPack._ms;
  metaRoomLookupMs += cmSummaryPack._ms;

  const rows = roomsPack.data;
  const selErr = roomsPack.error;
  const cmRoom = cmSummaryPack.data;

  if (selErr || !rows?.length) {
    if (diag) {
      diag.registry_background_dedupe_hit = 0;
      diag.registry_background_skipped_reason = "";
      diag.registry_background_inflight_key = syncIdentityKey;
      diag.registry_background_cache_hit = 0;
      applyItemTradeSyncDiag(diag, {
        tAll,
        dbWallMs,
        loopWallMs: 0,
        metaWallMs: metaRoomLookupMs,
        cacheWallMs: 0,
        rowsLen: 0,
        unreadQueryCount,
        metaQueryCount,
        unreadResolveMs: 0,
        unreadMessageFetchMs: 0,
        unreadParticipantUpdateMs: 0,
        unreadMessagesReadAtMs: 0,
        unreadProductChatsMs: 0,
        unreadParticipantPrefetchMs: 0,
        unreadReadAtProbeMs: 0,
        participantUpdateSkips: 0,
        readAtUpdateSkips: 0,
        readAtProbeZeroSkips: 0,
        readAtUpdatesExecuted: 0,
        metaRoomLookupMs,
        metaParseMs: 0,
        metaProductLookupMs: 0,
        metaProductUpdateMs: 0,
        metaRoomCacheHit,
        metaPcLookupCacheHit: 0,
        metaProductUpdateSkipped: 0,
      });
    }
    return;
  }

  const rowList = rows as Array<{
    id?: unknown;
    last_message_id?: string | null;
    item_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
  }>;

  const now = new Date().toISOString();
  let touched = false;

  let unreadParticipantPrefetchMs = 0;
  let unreadReadAtProbeMs = 0;
  let participantUpdateSkips = 0;
  let readAtUpdateSkips = 0;
  let readAtProbeZeroSkips = 0;
  let readAtUpdatesExecuted = 0;

  const tLoop0 = devPerfNow();
  const rowCount = rowList.filter((r) => trimId(r.id)).length;

  const roomIds = [...new Set(rowList.map((r) => trimId(r.id)).filter(Boolean))];
  const tPartPf = devPerfNow();
  const partByRoom = new Map<string, { last_read_message_id: string; unread_count: number }>();
  if (roomIds.length > 0) {
    const { data: partRows, error: pErr } = await sbAny
      .from("chat_room_participants")
      .select("room_id, last_read_message_id, unread_count")
      .eq("user_id", uid)
      .in("room_id", roomIds);
    unreadQueryCount += 1;
    if (!pErr) {
      for (const p of partRows ?? []) {
        const rid = trimId((p as { room_id?: unknown }).room_id);
        if (!rid) continue;
        partByRoom.set(rid, {
          last_read_message_id: normLastReadMessageId(
            (p as { last_read_message_id?: string | null }).last_read_message_id
          ),
          unread_count: Number((p as { unread_count?: unknown }).unread_count) || 0,
        });
      }
    }
  }
  unreadParticipantPrefetchMs = devPerfNow() - tPartPf;

  for (const cr of rowList) {
    const itemTradeRoomId = trimId(cr.id);
    if (!itemTradeRoomId) continue;

    const timingHelper = {
      addQueryMs(ms: number) {
        unreadResolveMs += ms;
      },
      addQueries(n: number) {
        unreadQueryCount += n;
      },
    };

    const lastReadId = await resolveItemTradeLastReadMessageIdForMessengerMark(
      sbAny,
      {
        itemTradeRoomId,
        cmRoomId: cmId,
        cmLastReadMessageId: cmCursor,
        chatRoomsLastMessageId: trimId(cr.last_message_id) || null,
        knownCmMessageCreatedAt: input.communityMessengerLastReadMessageCreatedAt ?? undefined,
      },
      timingHelper,
      cacheHits
    );

    const partSnap = partByRoom.get(itemTradeRoomId);
    const resolvedNorm = normLastReadMessageId(lastReadId);
    const skipParticipant =
      partSnap != null &&
      partSnap.last_read_message_id === resolvedNorm &&
      partSnap.unread_count === 0;

    if (!skipParticipant) {
      const tUp = devPerfNow();
      const { data: updated, error: upErr } = await sbAny
        .from("chat_room_participants")
        .update({
          last_read_message_id: lastReadId,
          last_read_at: now,
          unread_count: 0,
          updated_at: now,
        })
        .eq("room_id", itemTradeRoomId)
        .eq("user_id", uid)
        .select("id");
      unreadParticipantUpdateMs += devPerfNow() - tUp;
      unreadQueryCount += 1;

      if (upErr || !updated?.length) continue;
      touched = true;
    } else {
      participantUpdateSkips += 1;
    }

    let readThrough = now;
    const tCur = devPerfNow();
    if (lastReadId) {
      const lid = trimId(lastReadId);
      const nowMs = Date.now();
      const cachedCt = getCachedCreatedAt(chatMessageCreatedAtCache, lid, nowMs);
      if (cachedCt) {
        readThrough = cachedCt;
        cacheHits.n += 1;
      } else {
        const { data: curRow } = await sbAny.from("chat_messages").select("created_at").eq("id", lastReadId).maybeSingle();
        unreadQueryCount += 1;
        const ct = (curRow as { created_at?: string } | null)?.created_at;
        if (typeof ct === "string" && ct.length > 0) {
          readThrough = ct;
          setCachedCreatedAt(chatMessageCreatedAtCache, lid, ct, nowMs, CHAT_MSG_CREATED_AT_TTL_MS);
        }
      }
    }
    unreadMessageFetchMs += devPerfNow() - tCur;

    if (skipParticipant) {
      const tProbe = devPerfNow();
      const { data: probeRow } = await sbAny
        .from("chat_messages")
        .select("id")
        .eq("room_id", itemTradeRoomId)
        .neq("sender_id", uid)
        .lte("created_at", readThrough)
        .is("read_at", null)
        .limit(1)
        .maybeSingle();
      unreadReadAtProbeMs += devPerfNow() - tProbe;
      unreadQueryCount += 1;

      if (!probeRow) {
        readAtProbeZeroSkips += 1;
        readAtUpdateSkips += 1;
      } else {
        const tRa = devPerfNow();
        const { error: raErr } = await sbAny
          .from("chat_messages")
          .update({ read_at: now })
          .eq("room_id", itemTradeRoomId)
          .neq("sender_id", uid)
          .lte("created_at", readThrough)
          .is("read_at", null);
        unreadMessagesReadAtMs += devPerfNow() - tRa;
        unreadQueryCount += 1;
        readAtUpdatesExecuted += 1;
        if (!raErr) touched = true;
      }
    } else {
      const tRa = devPerfNow();
      await sbAny
        .from("chat_messages")
        .update({ read_at: now })
        .eq("room_id", itemTradeRoomId)
        .neq("sender_id", uid)
        .lte("created_at", readThrough)
        .is("read_at", null);
      unreadMessagesReadAtMs += devPerfNow() - tRa;
      unreadQueryCount += 1;
      readAtUpdatesExecuted += 1;
    }

    const itemId = trimId(cr.item_id);
    const sellerId = trimId(cr.seller_id);
    const buyerId = trimId(cr.buyer_id);
    if (itemId && sellerId && buyerId) {
      const tPc = devPerfNow();
      const pcUpdates: Record<string, unknown> = { updated_at: now };
      if (sellerId === uid) pcUpdates.unread_count_seller = 0;
      else if (buyerId === uid) pcUpdates.unread_count_buyer = 0;
      if (Object.keys(pcUpdates).length > 1) {
        await sbAny
          .from("product_chats")
          .update(pcUpdates)
          .eq("post_id", itemId)
          .eq("seller_id", sellerId)
          .eq("buyer_id", buyerId);
        unreadQueryCount += 1;
      }
      unreadProductChatsMs += devPerfNow() - tPc;
    }
  }
  loopWallMs += devPerfNow() - tLoop0;

  let metaProductUpdateSkipped: 0 | 1 = 0;
  const tMeta = devPerfNow();
  const tParse = devPerfNow();
  const meta = parseCommunityMessengerRoomContextMeta((cmRoom as { summary?: string | null } | null)?.summary ?? "");
  metaParseMs += devPerfNow() - tParse;

  if (meta?.kind === "trade") {
    const pcid = trimId(meta.productChatId);
    if (pcid) {
      const tPcSel = devPerfNow();
      const { data: pc } = await sbAny
        .from("product_chats")
        .select("seller_id, buyer_id, unread_count_seller, unread_count_buyer")
        .eq("id", pcid)
        .maybeSingle();
      metaProductLookupMs += devPerfNow() - tPcSel;
      metaQueryCount += 1;
      if (pc) {
        const sellerId = trimId((pc as { seller_id?: unknown }).seller_id);
        const buyerId = trimId((pc as { buyer_id?: unknown }).buyer_id);
        const unreadSeller = Number((pc as { unread_count_seller?: unknown }).unread_count_seller) || 0;
        const unreadBuyer = Number((pc as { unread_count_buyer?: unknown }).unread_count_buyer) || 0;
        if (sellerId && buyerId && (uid === sellerId || uid === buyerId)) {
          const sideUnread = uid === sellerId ? unreadSeller : unreadBuyer;
          if (sideUnread === 0) {
            metaProductUpdateSkipped = 1;
          } else {
            const tPcUp = devPerfNow();
            const pcUpdates: Record<string, unknown> = { updated_at: now };
            if (sellerId === uid) pcUpdates.unread_count_seller = 0;
            else pcUpdates.unread_count_buyer = 0;
            const { error: pcErr } = await sbAny.from("product_chats").update(pcUpdates).eq("id", pcid);
            metaProductUpdateMs += devPerfNow() - tPcUp;
            metaQueryCount += 1;
            if (!pcErr) touched = true;
          }
        }
      }
    }
  }
  metaWallMs += devPerfNow() - tMeta;

  const tCache = devPerfNow();
  if (touched) {
    invalidateUserChatUnreadCache(uid);
    invalidateOwnerHubBadgeCache(uid);
  }
  cacheWallMs += devPerfNow() - tCache;

  if (touched) {
    identicalSyncCooldown.set(syncIdentityKey, Date.now());
  }

  if (diag) {
    diag.registry_background_dedupe_hit = 0;
    diag.registry_background_skipped_reason = "";
    diag.registry_background_inflight_key = syncIdentityKey;
    diag.registry_background_cache_hit = cacheHits.n;
    applyItemTradeSyncDiag(diag, {
      tAll,
      dbWallMs,
      loopWallMs,
      metaWallMs,
      cacheWallMs,
      rowsLen: rowCount,
      unreadQueryCount,
      metaQueryCount,
      unreadResolveMs,
      unreadMessageFetchMs,
      unreadParticipantUpdateMs,
      unreadMessagesReadAtMs,
      unreadProductChatsMs,
      unreadParticipantPrefetchMs,
      unreadReadAtProbeMs,
      participantUpdateSkips,
      readAtUpdateSkips,
      readAtProbeZeroSkips,
      readAtUpdatesExecuted,
      metaRoomLookupMs,
      metaParseMs,
      metaProductLookupMs,
      metaProductUpdateMs,
      metaRoomCacheHit,
      metaPcLookupCacheHit: 0,
      metaProductUpdateSkipped,
    });
  }
}
