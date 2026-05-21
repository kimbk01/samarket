import type { SupabaseClient } from "@supabase/supabase-js";
import { HUB_BADGE_UNREAD_COUNTERS_TABLE, hubBadgeUnreadCounterTtlMs } from "@/lib/chat/hub-badge-unread-counter";
import {
  emptyCmUnreadAggregatePerf,
  logCmUnreadAggregatePerf,
  type CmUnreadAggregatePerfLog,
} from "@/lib/community-messenger/cm-unread-aggregate-perf";
import { readCmUnreadRoomCountMemory } from "@/lib/community-messenger/cm-unread-room-count-memory-cache";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export type CmUnreadAggregateRead =
  | { hit: false; reason: "missing" | "stale" | "no_table" | "no_column" | "error" }
  | { hit: true; unreadRoomCount: number; stalenessMs: number };

/** `hub_badge_user_unread_counters.community_messenger_unread_room_count` — 1 PK lookup */
export async function readCmUnreadRoomCountAggregate(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<CmUnreadAggregateRead> {
  const uid = userId.trim();
  if (!uid) return { hit: false, reason: "missing" };

  const { data, error } = await sbAny
    .from(HUB_BADGE_UNREAD_COUNTERS_TABLE)
    .select("community_messenger_unread_room_count, updated_at")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("community_messenger_unread_room_count") || error.code === "42703") {
      return { hit: false, reason: "no_column" };
    }
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { hit: false, reason: "no_table" };
    }
    return { hit: false, reason: "error" };
  }
  if (!data?.updated_at) return { hit: false, reason: "missing" };

  const stalenessMs = Math.max(0, Date.now() - new Date(data.updated_at as string).getTime());
  if (stalenessMs > hubBadgeUnreadCounterTtlMs()) {
    return { hit: false, reason: "stale" };
  }

  return {
    hit: true,
    unreadRoomCount: Math.max(
      0,
      Math.floor(Number((data as { community_messenger_unread_room_count?: unknown }).community_messenger_unread_room_count) || 0)
    ),
    stalenessMs,
  };
}

export async function writeCmUnreadRoomCountAggregate(
  sbAny: SupabaseClient<any>,
  userId: string,
  unreadRoomCount: number
): Promise<{ upserted: boolean; noColumn?: boolean }> {
  const uid = userId.trim();
  if (!uid) return { upserted: false };
  const now = new Date().toISOString();
  const { error } = await sbAny.from(HUB_BADGE_UNREAD_COUNTERS_TABLE).upsert(
    {
      user_id: uid,
      community_messenger_unread_room_count: Math.max(0, Math.floor(unreadRoomCount) || 0),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    const msg = error.message ?? "";
    const noColumn =
      msg.includes("community_messenger_unread_room_count") || error.code === "42703";
    if (process.env.NODE_ENV === "development" && !noColumn) {
      // eslint-disable-next-line no-console
      console.warn("[cm-unread-aggregate-upsert]", msg);
    }
    return { upserted: false, noColumn };
  }
  return { upserted: true };
}

export function emitCmUnreadAggregatePerfFromTiming(
  perf: CmUnreadAggregatePerfLog,
  opts: {
    via: CmUnreadAggregatePerfLog["aggregate_via"];
    totalMs: number;
    rpcMs?: number;
    dbTrips?: number;
    stalenessMs?: number;
    cacheHit?: boolean;
    counterRowHit?: boolean;
    counterUpserted?: boolean;
    hubBadgeRouteCacheHit?: boolean;
  }
): void {
  perf.aggregate_via = opts.via;
  perf.cm_unread_via = opts.via === "hub_cache_observed" ? "memory" : opts.via;
  perf.aggregate_total_ms = Math.round(opts.totalMs);
  perf.aggregate_rpc_ms = Math.round(opts.rpcMs ?? 0);
  perf.aggregate_db_round_trips =
    opts.dbTrips ?? (opts.via === "counter_row" ? 1 : opts.via === "memory" ? 0 : opts.via === "rpc" ? 1 : 0);
  perf.aggregate_staleness_ms = Math.round(opts.stalenessMs ?? 0);
  perf.aggregate_hit =
    opts.via === "counter_row" || opts.via === "memory" || opts.counterRowHit ? 1 : 0;
  perf.aggregate_cache_hit = (opts.cacheHit || opts.via === "memory") ? 1 : 0;
  perf.aggregate_counter_row_hit = opts.counterRowHit || opts.via === "counter_row" ? 1 : 0;
  perf.aggregate_counter_upserted = opts.counterUpserted ? 1 : 0;
  if (opts.hubBadgeRouteCacheHit) perf.hub_badge_route_cache_hit = 1;
  logCmUnreadAggregatePerf(perf);
}

/** hub-badge route TTL hit — CM aggregate 레이어(memory) 관측만 (DB·semantics 불변). */
export function observeCmUnreadAggregateOnHubRouteCacheHit(userId: string): void {
  if (process.env.NODE_ENV !== "development") return;
  const uid = userId.trim();
  if (!uid) return;
  const mem = readCmUnreadRoomCountMemory(uid);
  const perf = emptyCmUnreadAggregatePerf();
  if (mem.hit) {
    emitCmUnreadAggregatePerfFromTiming(perf, {
      via: "memory",
      totalMs: 0,
      dbTrips: 0,
      stalenessMs: mem.ageMs,
      cacheHit: true,
      hubBadgeRouteCacheHit: true,
    });
    return;
  }
  emitCmUnreadAggregatePerfFromTiming(perf, {
    via: "hub_cache_observed",
    totalMs: 0,
    dbTrips: 0,
    cacheHit: false,
    hubBadgeRouteCacheHit: true,
  });
}

export { emptyCmUnreadAggregatePerf };
