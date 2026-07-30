import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubBadgeCmUnreadTiming } from "@/lib/chats/hub-badge-wave2-perf";
import {
  buildCmUnreadDeepBreakdown,
  logCmUnreadDeepBreakdown,
} from "@/lib/community-messenger/cm-unread-deep-breakdown";
import { emptyCmUnreadAggregatePerf } from "@/lib/community-messenger/cm-unread-aggregate-perf";
import {
  emitCmUnreadAggregatePerfFromTiming,
  readCmUnreadRoomCountAggregate,
  cmUnreadRoomCountAggregateStaleServeMaxMs,
  writeCmUnreadRoomCountAggregate,
} from "@/lib/community-messenger/cm-unread-room-count-aggregate";
import {
  cmUnreadDedupeKey,
  communityMessengerUnreadMemoryTtlMs,
  invalidateCommunityMessengerUnreadTotalCache,
  readCmUnreadRoomCountMemory,
  scheduleCmUnreadSnapshotRevalidate,
  writeCmUnreadRoomCountMemory,
} from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import { roomSummaryCountsForBottomChat } from "@/lib/community-messenger/notifications/bottom-chat-live-room-count";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export { invalidateCommunityMessengerUnreadTotalCache };

export const CM_UNREAD_ROOM_COUNT_RPC = "get_community_messenger_unread_room_count";

/**
 * 하단 「메신저」탭 / Hub CM 배지용 — unread **방 수** (메시지 합 아님).
 * B3: general_direct + group 만 (trade / store_order · commerce direct_key 제외).
 *
 * 예: 방 A unread 5, 방 B unread 1 → 배지 2
 */

type CmUnreadRpcProbe = {
  result: number | null;
  wallMs: number;
  payloadBytes: number;
  parseMs: number;
};

async function sumCommunityMessengerParticipantUnreadViaRpc(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<CmUnreadRpcProbe> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(CM_UNREAD_ROOM_COUNT_RPC, {
    p_user_id: uid,
  });
  const wallMs = devPerfNow() - rpc0;
  const payloadBytes = Buffer.byteLength(JSON.stringify(error ?? data ?? null), "utf8");
  const parse0 = devPerfNow();
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev RPC deploy probe
      console.warn("[cm-unread-rpc-miss]", error.message);
    }
    return { result: null, wallMs, payloadBytes, parseMs: devPerfNow() - parse0 };
  }
  let result: number | null = null;
  if (typeof data === "number" && Number.isFinite(data)) {
    result = Math.max(0, Math.floor(data));
  } else if (data != null && typeof data === "object" && "unread_room_count" in (data as object)) {
    result = Math.max(
      0,
      Math.floor(Number((data as { unread_room_count: unknown }).unread_room_count) || 0)
    );
  } else {
    result = Math.max(0, Math.floor(Number(data) || 0));
  }
  const parseMs = devPerfNow() - parse0;
  return { result, wallMs, payloadBytes, parseMs };
}

/**
 * Legacy PostgREST — RPC 실패 시만.
 * B3: head count 금지 — trade/store_order·commerce direct_key 제외 후 GD+group만.
 */
async function sumCommunityMessengerParticipantUnreadLegacy(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<{ result: number; error?: string; wallMs: number; payloadBytes: number }> {
  const legacy0 = devPerfNow();
  const { data, error } = await sbAny
    .from("community_messenger_participants")
    .select(
      "id, room:community_messenger_rooms!inner(chat_domain, direct_key, room_type, deleted_at)"
    )
    .eq("user_id", uid)
    .gt("unread_count", 0);
  const wallMs = devPerfNow() - legacy0;
  const payloadBytes = Buffer.byteLength(JSON.stringify({ data, error: error?.message ?? null }), "utf8");
  if (error) {
    // Pre-migration: deleted_at column missing — retry without tombstone filter
    if (/deleted_at|column/i.test(String(error.message ?? ""))) {
      const retry = await sbAny
        .from("community_messenger_participants")
        .select("id, room:community_messenger_rooms!inner(chat_domain, direct_key, room_type)")
        .eq("user_id", uid)
        .gt("unread_count", 0);
      if (retry.error) {
        return { result: 0, error: retry.error.message, wallMs, payloadBytes };
      }
      const rowsRetry = Array.isArray(retry.data) ? retry.data : [];
      let resultRetry = 0;
      for (const row of rowsRetry) {
        const roomRaw = (row as { room?: unknown }).room;
        const room = (Array.isArray(roomRaw) ? roomRaw[0] : roomRaw) as
          | { chat_domain?: unknown; direct_key?: unknown; room_type?: unknown }
          | null
          | undefined;
        if (
          roomSummaryCountsForBottomChat({
            chatDomain: (room?.chat_domain as CommunityMessengerRoomSummary["chatDomain"]) ?? null,
            roomType: (room?.room_type as CommunityMessengerRoomSummary["roomType"]) ?? "direct",
            messengerDirectKey: typeof room?.direct_key === "string" ? room.direct_key : null,
            contextMeta: null,
          })
        ) {
          resultRetry += 1;
        }
      }
      return { result: resultRetry, wallMs, payloadBytes };
    }
    return { result: 0, error: error.message, wallMs, payloadBytes };
  }
  const rows = Array.isArray(data) ? data : [];
  let result = 0;
  for (const row of rows) {
    const roomRaw = (row as { room?: unknown }).room;
    const room = (Array.isArray(roomRaw) ? roomRaw[0] : roomRaw) as
      | { chat_domain?: unknown; direct_key?: unknown; room_type?: unknown; deleted_at?: unknown }
      | null
      | undefined;
    if (typeof room?.deleted_at === "string" && room.deleted_at.trim()) continue;
    if (
      roomSummaryCountsForBottomChat({
        chatDomain: (room?.chat_domain as CommunityMessengerRoomSummary["chatDomain"]) ?? null,
        roomType: (room?.room_type as CommunityMessengerRoomSummary["roomType"]) ?? "direct",
        messengerDirectKey: typeof room?.direct_key === "string" ? room.direct_key : null,
        contextMeta: null,
      })
    ) {
      result += 1;
    }
  }
  return { result, wallMs, payloadBytes };
}

function scheduleCmUnreadAggregateUpsert(
  sbAny: SupabaseClient<any>,
  uid: string,
  unreadRoomCount: number
): void {
  void writeCmUnreadRoomCountAggregate(sbAny, uid, unreadRoomCount).catch(() => {});
}

/** memory·aggregate miss 시 RPC/legacy — revalidate·cold path 공유 */
async function fetchCmUnreadRoomCountFromDb(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<number> {
  const rpcProbe = await sumCommunityMessengerParticipantUnreadViaRpc(sbAny, uid);
  if (rpcProbe.result != null) {
    scheduleCmUnreadAggregateUpsert(sbAny, uid, rpcProbe.result);
    return rpcProbe.result;
  }
  const legacy = await sumCommunityMessengerParticipantUnreadLegacy(sbAny, uid);
  if (!legacy.error) {
    scheduleCmUnreadAggregateUpsert(sbAny, uid, legacy.result);
  }
  return legacy.result;
}

function applyCmUnreadMemoryHitTiming(
  timingOut: HubBadgeCmUnreadTiming,
  totalMs: number,
  unreadRoomCount: number,
  ageMs: number
): void {
  timingOut.cm_unread_ms = Math.round(totalMs);
  timingOut.cm_unread_query_ms = 0;
  timingOut.cm_unread_rpc_ms = 0;
  timingOut.cm_unread_legacy_ms = 0;
  timingOut.cm_unread_via = "memory";
  timingOut.cm_unread_rows = unreadRoomCount;
  timingOut.cm_unread_memory_hit = 1;
  timingOut.cm_unread_memory_age_ms = Math.round(ageMs);
}

function logCmUnreadDeepFromPath(input: {
  mountMs: number;
  totalMs: number;
  cacheLookupMs: number;
  cacheSetMs: number;
  cacheSetUpsertDeferred?: boolean;
  postgrestWallMs: number;
  responseParseMs: number;
  aggregationMs: number;
  payloadBytes: number;
  unreadRoomCount: number;
  via: string;
  cacheHit: boolean;
  actualHandlerMs?: number | null;
}): void {
  logCmUnreadDeepBreakdown(
    buildCmUnreadDeepBreakdown({
      mountMs: input.mountMs,
      totalMs: input.totalMs,
      cacheLookupMs: input.cacheLookupMs,
      cacheSetMs: input.cacheSetMs,
      cacheSetUpsertDeferred: input.cacheSetUpsertDeferred,
      postgrestWallMs: input.postgrestWallMs,
      responseParseMs: input.responseParseMs,
      aggregationMs: input.aggregationMs,
      payloadBytes: input.payloadBytes,
      unreadRoomCount: input.unreadRoomCount,
      via: input.via,
      cacheHit: input.cacheHit,
      actualHandlerMs: input.actualHandlerMs,
    })
  );
}

export type SumCommunityMessengerParticipantUnreadOpts = {
  actualHandlerMs?: number | null;
};

async function sumCommunityMessengerParticipantUnreadInner(
  sbAny: SupabaseClient<any>,
  userId: string,
  timingOut?: HubBadgeCmUnreadTiming,
  opts?: SumCommunityMessengerParticipantUnreadOpts
): Promise<number> {
  const uid = userId.trim();
  if (!uid) {
    if (timingOut) timingOut.cm_unread_via = "skipped";
    return 0;
  }

  const mountMs = devPerfNow();
  const aggregatePerf = emptyCmUnreadAggregatePerf();
  let cacheLookupMs = 0;
  let cacheSetMs = 0;
  const aggregationMs = 0;

  const memLookup0 = devPerfNow();
  const mem = readCmUnreadRoomCountMemory(uid);
  cacheLookupMs += devPerfNow() - memLookup0;

  if (mem.hit) {
    const totalMs = devPerfNow() - mountMs;
    if (mem.stale) {
      scheduleCmUnreadSnapshotRevalidate(uid, () => fetchCmUnreadRoomCountFromDb(sbAny, uid));
    }
    if (timingOut) {
      applyCmUnreadMemoryHitTiming(timingOut, totalMs, mem.unreadRoomCount, mem.ageMs);
    }
    emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
      via: "memory",
      totalMs,
      dbTrips: 0,
      stalenessMs: mem.ageMs,
      cacheHit: true,
    });
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- TTL 내 RPC RTT 생략
      console.info("[cm-unread-memory-hit]", {
        user_id_short: uid.slice(0, 8),
        cm_unread_memory_age_ms: Math.round(mem.ageMs),
        ttl_ms: communityMessengerUnreadMemoryTtlMs(),
        unread_room_count: mem.unreadRoomCount,
        stale_snapshot_within_ttl: Boolean(mem.stale),
      });
    }
    logCmUnreadDeepFromPath({
      mountMs,
      totalMs,
      cacheLookupMs,
      cacheSetMs: 0,
      postgrestWallMs: 0,
      responseParseMs: 0,
      aggregationMs,
      payloadBytes: 0,
      unreadRoomCount: mem.unreadRoomCount,
      via: "memory",
      cacheHit: true,
      actualHandlerMs: opts?.actualHandlerMs,
    });
    return mem.unreadRoomCount;
  }

  const aggLookup0 = devPerfNow();
  const agg = await readCmUnreadRoomCountAggregate(sbAny, uid, {
    serveStaleWithinMs: cmUnreadRoomCountAggregateStaleServeMaxMs(),
  });
  const aggMs = devPerfNow() - aggLookup0;
  cacheLookupMs += aggMs;

  if (agg.hit) {
    const memSet0 = devPerfNow();
    writeCmUnreadRoomCountMemory(uid, agg.unreadRoomCount);
    cacheSetMs += devPerfNow() - memSet0;
    if (agg.stale) {
      scheduleCmUnreadSnapshotRevalidate(uid, () => fetchCmUnreadRoomCountFromDb(sbAny, uid));
    }
    const totalMs = devPerfNow() - mountMs;
    if (timingOut) {
      timingOut.cm_unread_ms = Math.round(totalMs);
      timingOut.cm_unread_query_ms = Math.round(aggMs);
      timingOut.cm_unread_rpc_ms = 0;
      timingOut.cm_unread_legacy_ms = 0;
      timingOut.cm_unread_via = "aggregate";
      timingOut.cm_unread_rows = agg.unreadRoomCount;
      timingOut.cm_unread_memory_hit = 0;
    }
    emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
      via: "counter_row",
      totalMs,
      rpcMs: aggMs,
      dbTrips: 1,
      stalenessMs: agg.stalenessMs,
      cacheHit: true,
      counterRowHit: true,
    });
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info("[cm-unread-aggregate-hit]", {
        user_id_short: uid.slice(0, 8),
        unread_room_count: agg.unreadRoomCount,
        aggregate_staleness_ms: Math.round(agg.stalenessMs),
        aggregate_stale_swr: Boolean(agg.stale),
      });
    }
    logCmUnreadDeepFromPath({
      mountMs,
      totalMs,
      cacheLookupMs,
      cacheSetMs,
      postgrestWallMs: aggMs,
      responseParseMs: 0,
      aggregationMs,
      payloadBytes: 64,
      unreadRoomCount: agg.unreadRoomCount,
      via: "counter_row",
      cacheHit: true,
      actualHandlerMs: opts?.actualHandlerMs,
    });
    return agg.unreadRoomCount;
  }

  const rpc0 = devPerfNow();
  const rpcResult = await fetchCmUnreadRoomCountFromDb(sbAny, uid);
  const rpcWallMs = devPerfNow() - rpc0;

  const memSet0 = devPerfNow();
  writeCmUnreadRoomCountMemory(uid, rpcResult);
  cacheSetMs += devPerfNow() - memSet0;
  emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
    via: "rpc",
    totalMs: devPerfNow() - mountMs,
    rpcMs: rpcWallMs,
    dbTrips: 1,
    counterUpserted: false,
  });
  if (timingOut) {
    timingOut.cm_unread_ms = Math.round(devPerfNow() - mountMs);
    timingOut.cm_unread_query_ms = Math.round(rpcWallMs);
    timingOut.cm_unread_rpc_ms = Math.round(rpcWallMs);
    timingOut.cm_unread_legacy_ms = 0;
    timingOut.cm_unread_via = "rpc";
    timingOut.cm_unread_rows = rpcResult;
    timingOut.cm_unread_memory_hit = 0;
  }
  const totalMs = devPerfNow() - mountMs;
  logCmUnreadDeepFromPath({
    mountMs,
    totalMs,
    cacheLookupMs,
    cacheSetMs,
    cacheSetUpsertDeferred: true,
    postgrestWallMs: rpcWallMs,
    responseParseMs: 0,
    aggregationMs,
    payloadBytes: 32,
    unreadRoomCount: rpcResult,
    via: "rpc",
    cacheHit: false,
    actualHandlerMs: opts?.actualHandlerMs,
  });
  return rpcResult;
}

export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string,
  timingOut?: HubBadgeCmUnreadTiming,
  opts?: SumCommunityMessengerParticipantUnreadOpts
): Promise<number> {
  const uid = userId.trim();
  if (!uid) {
    if (timingOut) timingOut.cm_unread_via = "skipped";
    return 0;
  }
  return runSingleFlight(cmUnreadDedupeKey(uid), () =>
    sumCommunityMessengerParticipantUnreadInner(sbAny, userId, timingOut, opts)
  );
}
