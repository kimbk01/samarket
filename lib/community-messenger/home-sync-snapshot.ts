/**
 * Home-sync critical snapshot — read path (counter row → unified RPC → legacy fallback).
 * Route must not multi-wave aggregate when snapshot path succeeds (1 RTT max cold).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleHomeSyncCriticalFromSnapshotPayload,
  parseHomeSyncSnapshotRpcData,
  type HomeSyncSnapshotPayloadJson,
} from "@/lib/community-messenger/home-sync-snapshot-assemble";
import {
  CM_HOME_SYNC_SNAPSHOT_TABLE,
  homeSyncSnapshotCounterTtlMs,
} from "@/lib/community-messenger/home-sync-snapshot-counter";
import { scheduleHomeSyncSnapshotRefresh } from "@/lib/community-messenger/home-sync-snapshot-refresh";
import {
  evaluateHomeSyncRegressionGuards,
  type HomeSyncSnapshotBreakdown,
} from "@/lib/community-messenger/home-sync-regression-guard";
import {
  logRouteHotpathAnalysis,
  logSnapshotRpcDesignOnce,
} from "@/lib/community-messenger/home-sync-hotpath-analysis";
import { COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP } from "@/lib/community-messenger/home-sync-room-caps";
import { homeSyncTraceMeterEnabled, ms, type HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const HOME_SYNC_SNAPSHOT_RPC = "get_community_messenger_home_sync_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "cm-home-sync-snapshot:";

export type HomeSyncSnapshotRow = {
  tier: string;
  room_cap: number;
  payload_json: HomeSyncSnapshotPayloadJson;
  updated_at: string;
};

type SnapshotReadVia = "counter_row" | "unified_rpc";

function counterSelectFields(): string {
  return ["user_id", "tier", "room_cap", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): HomeSyncSnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    tier: typeof data.tier === "string" ? data.tier : "critical",
    room_cap: Math.max(1, Math.floor(Number(data.room_cap) || COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP)),
    payload_json: payload as HomeSyncSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

export async function readHomeSyncSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: HomeSyncSnapshotRow; ageMs: number; stale: boolean }
> {
  const uid = userId.trim();
  const { data, error } = await sbAny
    .from(CM_HOME_SYNC_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payload_json") || msg.includes("room_cap") || error.code === "42703") {
      return { hit: false, reason: "no_column" };
    }
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { hit: false, reason: "missing" };
    }
    return { hit: false, reason: "error" };
  }
  const row = data ? rowFromDb(data as unknown as Record<string, unknown>) : null;
  if (!row) return { hit: false, reason: "missing" };

  const ageMs = Math.max(0, Date.now() - new Date(row.updated_at).getTime());
  const stale = ageMs > homeSyncSnapshotCounterTtlMs();
  return { hit: true, row, ageMs, stale };
}

export async function upsertHomeSyncSnapshotCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  snapshot: Omit<HomeSyncSnapshotRow, "updated_at">
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const now = new Date().toISOString();
  const { error } = await sbAny.from(CM_HOME_SYNC_SNAPSHOT_TABLE).upsert(
    {
      user_id: uid,
      tier: snapshot.tier,
      room_cap: snapshot.room_cap,
      payload_json: snapshot.payload_json,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[home-sync-snapshot-upsert]", error.message);
  }
}

export async function fetchHomeSyncSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomCap: number
): Promise<{ payload: HomeSyncSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(HOME_SYNC_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_limit: roomCap,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[home-sync-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseHomeSyncSnapshotRpcData(data), rpcMs };
}

export async function refreshHomeSyncSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  roomCap: number = COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP
): Promise<HomeSyncSnapshotRow | null> {
  const { payload } = await fetchHomeSyncSnapshotViaRpc(sbAny, userId, roomCap);
  if (!payload) return null;
  const row: Omit<HomeSyncSnapshotRow, "updated_at"> = {
    tier: "critical",
    room_cap: roomCap,
    payload_json: payload,
  };
  await upsertHomeSyncSnapshotCounter(sbAny, userId, row);
  return { ...row, updated_at: new Date().toISOString() };
}

function buildSnapshotBreakdown(input: {
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  assembleMs: number;
  stale?: boolean;
}): HomeSyncSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  const payloadBuildMs = Math.round(input.assembleMs);
  const totalMs = Math.round(input.totalMs);
  const worstStage = input.via === "counter_row" ? "home_sync_snapshot_row" : "home_sync_unified_rpc";
  const worstStageMs = dbMs;
  return {
    total_ms: totalMs,
    db_ms: dbMs,
    round_trips: 1,
    transport_ms: dbMs,
    serialization_ms: 0,
    payload_build_ms: payloadBuildMs,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    embed_join_detected: 0,
    aggregate_compute_detected: 0,
    worst_stage: worstStage,
    worst_stage_ms: worstStageMs,
    cache_hit_reason:
      input.via === "counter_row" ? "home_sync_snapshot_row" : "home_sync_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via === "counter_row" ? "counter_row" : "unified_rpc",
  };
}

export type HomeSyncSnapshotBuildResult = {
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  breakdown: HomeSyncSnapshotBreakdown;
  snapshotPath: 1;
};

export class HomeSyncSnapshotUnavailableError extends Error {
  readonly code = "snapshot_unavailable" as const;
  constructor(readonly reason: string) {
    super(`home-sync snapshot unavailable: ${reason}`);
    this.name = "HomeSyncSnapshotUnavailableError";
  }
}

/** Snapshot-first critical build — null = unified RPC unavailable; caller returns 503. */
export async function tryBuildHomeSyncCriticalFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  trace?: HomeSyncTrace,
  opts?: { forceRpc?: boolean }
): Promise<HomeSyncSnapshotBuildResult | null> {
  const uid = userId.trim();
  if (!uid) return null;

  logSnapshotRpcDesignOnce();

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${uid}`, async () => {
    const build0 = devPerfNow();
    const roomCap = COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;

    const finish = async (
      payload: HomeSyncSnapshotPayloadJson,
      readMs: number,
      via: SnapshotReadVia,
      stale?: boolean
    ): Promise<HomeSyncSnapshotBuildResult | null> => {
      const tAsm = performance.now();
      const assembled = await assembleHomeSyncCriticalFromSnapshotPayload(uid, payload, sbAny, trace);
      if (!assembled) return null;
      const assembleMs = performance.now() - tAsm;
      const breakdown = buildSnapshotBreakdown({
        totalMs: devPerfNow() - build0,
        readMs,
        via,
        assembleMs,
        stale,
      });
      logRouteHotpathAnalysis(breakdown, {
        tier: "critical",
        structuralNote:
          via === "counter_row"
            ? "request-time DB aggregate removed — precomputed snapshot row + CPU assemble"
            : "unified RPC cold fill — 1 RTT replaces 3-4 wave queries",
      });
      evaluateHomeSyncRegressionGuards({
        breakdown,
        allowedRoundTrips: 1,
        snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
        staleSnapshot: stale,
      });
      if (homeSyncTraceMeterEnabled(trace)) {
        trace!.deepSteps.bundleSteps = {
          ...(trace!.deepSteps.bundleSteps ?? {}),
          roomsFetchMs: ms(readMs),
          participantsProfilesMs: ms(assembled.participantsProfilesMs),
          summarizeRoomsMs: ms(assembled.summarizeMs),
          unreadBadgeMs: ms(assembled.unreadBadgeMs),
          payloadBuildMs: ms(assembled.payloadBuildMs),
          homeSyncSnapshotPath: 1,
          homeSyncSnapshotVia: via,
          queryWave2Ms: 0,
        };
      }
      return {
        chats: assembled.chats,
        groups: assembled.groups,
        breakdown,
        snapshotPath: 1,
      };
    };

    if (!opts?.forceRpc) {
      const read0 = devPerfNow();
      const counter = await readHomeSyncSnapshotCounter(sbAny, uid);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        return finish(counter.row.payload_json, readMs, "counter_row");
      }
      if (counter.hit && counter.stale) {
        scheduleHomeSyncSnapshotRefresh(uid);
        return finish(counter.row.payload_json, readMs, "counter_row", true);
      }
    }

    const rpc0 = devPerfNow();
    const { payload, rpcMs } = await fetchHomeSyncSnapshotViaRpc(sbAny, uid, roomCap);
    if (!payload?.lite_bundle) return null;

    await upsertHomeSyncSnapshotCounter(sbAny, uid, {
      tier: "critical",
      room_cap: roomCap,
      payload_json: payload,
    });

    return finish(payload, rpcMs || devPerfNow() - rpc0, "unified_rpc");
  });
}
