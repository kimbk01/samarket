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
  writeCmUnreadRoomCountAggregate,
} from "@/lib/community-messenger/cm-unread-room-count-aggregate";
import {
  communityMessengerUnreadMemoryTtlMs,
  invalidateCommunityMessengerUnreadTotalCache,
  readCmUnreadRoomCountMemory,
  scheduleCmUnreadSnapshotRevalidate,
  writeCmUnreadRoomCountMemory,
} from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export { invalidateCommunityMessengerUnreadTotalCache };

export const CM_UNREAD_ROOM_COUNT_RPC = "get_community_messenger_unread_room_count";

const CM_UNREAD_SINGLE_FLIGHT_PREFIX = "cm-unread-sum:";

/**
 * 하단 「메신저」탭 배지용 — `community_messenger_participants.unread_count > 0` 인 방 개수.
 *
 * 사용자 UX 규칙:
 * - 방 A unread 5
 * - 방 B unread 1
 * => 하단 메신저 배지 2
 *
 * 즉, unread 메시지 총합이 아니라 unread 방 수만 센다.
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

/** Legacy PostgREST count head — RPC 실패 시만 */
async function sumCommunityMessengerParticipantUnreadLegacy(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<{ result: number; error?: string; wallMs: number; payloadBytes: number }> {
  const legacy0 = devPerfNow();
  const { count, error } = await sbAny
    .from("community_messenger_participants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gt("unread_count", 0);
  const wallMs = devPerfNow() - legacy0;
  const payloadBytes = Buffer.byteLength(JSON.stringify({ count, error: error?.message ?? null }), "utf8");
  if (error) {
    return { result: 0, error: error.message, wallMs, payloadBytes };
  }
  return { result: Math.max(0, Math.floor(Number(count) || 0)), wallMs, payloadBytes };
}

function scheduleCmUnreadAggregateUpsert(
  sbAny: SupabaseClient<any>,
  uid: string,
  unreadRoomCount: number
): void {
  void writeCmUnreadRoomCountAggregate(sbAny, uid, unreadRoomCount).catch(() => {});
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
  let aggregationMs = 0;

  const memLookup0 = devPerfNow();
  const mem = readCmUnreadRoomCountMemory(uid);
  cacheLookupMs += devPerfNow() - memLookup0;

  if (mem.hit) {
    const totalMs = devPerfNow() - mountMs;
    if (mem.stale) {
      scheduleCmUnreadSnapshotRevalidate(uid, async () => {
        const agg = await readCmUnreadRoomCountAggregate(sbAny, uid);
        if (agg.hit) return agg.unreadRoomCount;
        const rpcProbe = await sumCommunityMessengerParticipantUnreadViaRpc(sbAny, uid);
        if (rpcProbe.result != null) return rpcProbe.result;
        const legacy = await sumCommunityMessengerParticipantUnreadLegacy(sbAny, uid);
        return legacy.result;
      });
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
  const agg = await readCmUnreadRoomCountAggregate(sbAny, uid);
  const aggMs = devPerfNow() - aggLookup0;
  cacheLookupMs += aggMs;

  if (agg.hit) {
    const memSet0 = devPerfNow();
    writeCmUnreadRoomCountMemory(uid, agg.unreadRoomCount);
    cacheSetMs += devPerfNow() - memSet0;
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

  const rpcProbe = await sumCommunityMessengerParticipantUnreadViaRpc(sbAny, uid);

  if (rpcProbe.result != null) {
    const memSet0 = devPerfNow();
    writeCmUnreadRoomCountMemory(uid, rpcProbe.result);
    cacheSetMs += devPerfNow() - memSet0;
    scheduleCmUnreadAggregateUpsert(sbAny, uid, rpcProbe.result);
    emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
      via: "rpc",
      totalMs: devPerfNow() - mountMs,
      rpcMs: rpcProbe.wallMs,
      dbTrips: 1,
      counterUpserted: false,
    });
    if (timingOut) {
      timingOut.cm_unread_ms = Math.round(devPerfNow() - mountMs);
      timingOut.cm_unread_query_ms = Math.round(rpcProbe.wallMs);
      timingOut.cm_unread_rpc_ms = Math.round(rpcProbe.wallMs);
      timingOut.cm_unread_legacy_ms = 0;
      timingOut.cm_unread_via = "rpc";
      timingOut.cm_unread_rows = rpcProbe.result;
      timingOut.cm_unread_memory_hit = 0;
    }
    const totalMs = devPerfNow() - mountMs;
    logCmUnreadDeepFromPath({
      mountMs,
      totalMs,
      cacheLookupMs,
      cacheSetMs,
      cacheSetUpsertDeferred: true,
      postgrestWallMs: rpcProbe.wallMs,
      responseParseMs: rpcProbe.parseMs,
      aggregationMs,
      payloadBytes: rpcProbe.payloadBytes,
      unreadRoomCount: rpcProbe.result,
      via: "rpc",
      cacheHit: false,
      actualHandlerMs: opts?.actualHandlerMs,
    });
    return rpcProbe.result;
  }

  const legacy = await sumCommunityMessengerParticipantUnreadLegacy(sbAny, uid);
  let counterUpserted = false;
  if (!legacy.error) {
    const memSet0 = devPerfNow();
    writeCmUnreadRoomCountMemory(uid, legacy.result);
    cacheSetMs += devPerfNow() - memSet0;
    scheduleCmUnreadAggregateUpsert(sbAny, uid, legacy.result);
    counterUpserted = false;
  }
  emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
    via: "legacy",
    totalMs: devPerfNow() - mountMs,
    rpcMs: rpcProbe.wallMs,
    dbTrips: 2,
    counterUpserted,
  });
  if (timingOut) {
    timingOut.cm_unread_ms = Math.round(devPerfNow() - mountMs);
    timingOut.cm_unread_query_ms = Math.round(legacy.wallMs);
    timingOut.cm_unread_rpc_ms = Math.round(rpcProbe.wallMs);
    timingOut.cm_unread_legacy_ms = Math.round(legacy.wallMs);
    timingOut.cm_unread_via = legacy.error ? "error" : "postgrest_count_head";
    timingOut.cm_unread_rows = legacy.result;
    timingOut.cm_unread_memory_hit = 0;
    if (legacy.error) timingOut.cm_unread_error = legacy.error.slice(0, 120);
  }
  const totalMs = devPerfNow() - mountMs;
  logCmUnreadDeepFromPath({
    mountMs,
    totalMs,
    cacheLookupMs,
    cacheSetMs,
    cacheSetUpsertDeferred: !legacy.error,
    postgrestWallMs: rpcProbe.wallMs + legacy.wallMs,
    responseParseMs: 0,
    aggregationMs,
    payloadBytes: legacy.payloadBytes + rpcProbe.payloadBytes,
    unreadRoomCount: legacy.result,
    via: legacy.error ? "error" : "postgrest_count_head",
    cacheHit: false,
    actualHandlerMs: opts?.actualHandlerMs,
  });
  return legacy.result;
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
  return runSingleFlight(`${CM_UNREAD_SINGLE_FLIGHT_PREFIX}${uid}`, () =>
    sumCommunityMessengerParticipantUnreadInner(sbAny, userId, timingOut, opts)
  );
}
