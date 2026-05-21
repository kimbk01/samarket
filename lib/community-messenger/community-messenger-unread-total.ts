import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubBadgeCmUnreadTiming } from "@/lib/chats/hub-badge-wave2-perf";
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
  writeCmUnreadRoomCountMemory,
} from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export { invalidateCommunityMessengerUnreadTotalCache };

export const CM_UNREAD_ROOM_COUNT_RPC = "get_community_messenger_unread_room_count";

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

async function sumCommunityMessengerParticipantUnreadViaRpc(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<number | null> {
  const { data, error } = await sbAny.rpc(CM_UNREAD_ROOM_COUNT_RPC, {
    p_user_id: uid,
  });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev RPC deploy probe
      console.warn("[cm-unread-rpc-miss]", error.message);
    }
    return null;
  }
  if (typeof data === "number" && Number.isFinite(data)) {
    return Math.max(0, Math.floor(data));
  }
  if (data != null && typeof data === "object" && "unread_room_count" in (data as object)) {
    return Math.max(0, Math.floor(Number((data as { unread_room_count: unknown }).unread_room_count) || 0));
  }
  return Math.max(0, Math.floor(Number(data) || 0));
}

/** Legacy PostgREST count head — RPC 실패 시만 */
async function sumCommunityMessengerParticipantUnreadLegacy(
  sbAny: SupabaseClient<any>,
  uid: string
): Promise<{ result: number; error?: string }> {
  const { count, error } = await sbAny
    .from("community_messenger_participants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gt("unread_count", 0);
  if (error) {
    return { result: 0, error: error.message };
  }
  return { result: Math.max(0, Math.floor(Number(count) || 0)) };
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

export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string,
  timingOut?: HubBadgeCmUnreadTiming
): Promise<number> {
  const uid = userId.trim();
  if (!uid) {
    if (timingOut) timingOut.cm_unread_via = "skipped";
    return 0;
  }

  const total0 = devPerfNow();
  const aggregatePerf = emptyCmUnreadAggregatePerf();
  const mem = readCmUnreadRoomCountMemory(uid);
  if (mem.hit) {
    const totalMs = devPerfNow() - total0;
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
        stale_snapshot_within_ttl: true,
      });
    }
    return mem.unreadRoomCount;
  }

  const agg0 = devPerfNow();
  const agg = await readCmUnreadRoomCountAggregate(sbAny, uid);
  const aggMs = devPerfNow() - agg0;
  if (agg.hit) {
    writeCmUnreadRoomCountMemory(uid, agg.unreadRoomCount);
    const totalMs = devPerfNow() - total0;
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
    return agg.unreadRoomCount;
  }

  const rpc0 = devPerfNow();
  const rpcResult = await sumCommunityMessengerParticipantUnreadViaRpc(sbAny, uid);
  const rpcMs = devPerfNow() - rpc0;

  if (rpcResult != null) {
    writeCmUnreadRoomCountMemory(uid, rpcResult);
    const upsert = await writeCmUnreadRoomCountAggregate(sbAny, uid, rpcResult);
    emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
      via: "rpc",
      totalMs: devPerfNow() - total0,
      rpcMs,
      dbTrips: 1,
      counterUpserted: upsert.upserted,
    });
    if (timingOut) {
      timingOut.cm_unread_ms = Math.round(devPerfNow() - total0);
      timingOut.cm_unread_query_ms = Math.round(rpcMs);
      timingOut.cm_unread_rpc_ms = Math.round(rpcMs);
      timingOut.cm_unread_legacy_ms = 0;
      timingOut.cm_unread_via = "rpc";
      timingOut.cm_unread_rows = rpcResult;
      timingOut.cm_unread_memory_hit = 0;
    }
    return rpcResult;
  }

  const legacy0 = devPerfNow();
  const { result, error } = await sumCommunityMessengerParticipantUnreadLegacy(sbAny, uid);
  const legacyMs = devPerfNow() - legacy0;
  let counterUpserted = false;
  if (!error) {
    writeCmUnreadRoomCountMemory(uid, result);
    const upsert = await writeCmUnreadRoomCountAggregate(sbAny, uid, result);
    counterUpserted = upsert.upserted;
  }
  emitCmUnreadAggregatePerfFromTiming(aggregatePerf, {
    via: "legacy",
    totalMs: devPerfNow() - total0,
    rpcMs,
    dbTrips: 2,
    counterUpserted,
  });
  if (timingOut) {
    timingOut.cm_unread_ms = Math.round(devPerfNow() - total0);
    timingOut.cm_unread_query_ms = Math.round(legacyMs);
    timingOut.cm_unread_rpc_ms = Math.round(rpcMs);
    timingOut.cm_unread_legacy_ms = Math.round(legacyMs);
    timingOut.cm_unread_via = error ? "error" : "postgrest_count_head";
    timingOut.cm_unread_rows = result;
    timingOut.cm_unread_memory_hit = 0;
    if (error) timingOut.cm_unread_error = error.slice(0, 120);
  }
  return result;
}

