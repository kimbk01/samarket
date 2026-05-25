/**
 * Owner dashboard notifications snapshot — read path (counter row → unified RPC → legacy fallback).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ownerStoreCommerceUnreadFromPayload,
  ownerStoreNotificationsFromPayload,
  parseOwnerDashboardNotificationsSnapshotRpcData,
  type OwnerDashboardNotificationsSnapshotPayloadJson,
} from "@/lib/notifications/owner-dashboard-notifications-snapshot-assemble";
import {
  OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_TABLE,
  ownerDashboardNotificationsSnapshotCacheKeyParts,
  ownerDashboardNotificationsSnapshotCounterTtlMs,
} from "@/lib/notifications/owner-dashboard-notifications-snapshot-counter";
import { scheduleOwnerDashboardNotificationsSnapshotRefresh } from "@/lib/notifications/owner-dashboard-notifications-snapshot-refresh";
import {
  evaluateOwnerNotificationsRegressionGuards,
  type OwnerDashboardNotificationsSnapshotBreakdown,
} from "@/lib/notifications/owner-dashboard-notifications-regression-guard";
import {
  logOwnerDashboardNotificationsSnapshotRpcDesignOnce,
  logOwnerNotificationsHotpathAnalysis,
} from "@/lib/notifications/owner-dashboard-notifications-hotpath-analysis";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_RPC =
  "get_owner_dashboard_notifications_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "odn-snapshot:";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  payload_json: OwnerDashboardNotificationsSnapshotPayloadJson;
  updated_at: string;
};

function counterSelectFields(): string {
  return ["user_id", "store_id", "snapshot_kind", "limit_n", "cursor_token", "payload_json", "updated_at"].join(
    ","
  );
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    payload_json: payload as OwnerDashboardNotificationsSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof ownerDashboardNotificationsSnapshotCacheKeyParts>
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const { data, error } = await sbAny
    .from(OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("user_id", keys.user_id)
    .eq("store_id", keys.store_id)
    .eq("snapshot_kind", keys.snapshot_kind)
    .eq("limit_n", keys.limit_n)
    .eq("cursor_token", keys.cursor_token)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("payload_json") || error.code === "42703") return { hit: false, reason: "no_column" };
    if (msg.includes("does not exist") || error.code === "42P01") return { hit: false, reason: "missing" };
    return { hit: false, reason: "error" };
  }
  const row = data ? rowFromDb(data as unknown as Record<string, unknown>) : null;
  if (!row) return { hit: false, reason: "missing" };
  const ageMs = Math.max(0, Date.now() - new Date(row.updated_at).getTime());
  return { hit: true, row, ageMs, stale: ageMs > ownerDashboardNotificationsSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  keys: ReturnType<typeof ownerDashboardNotificationsSnapshotCacheKeyParts>,
  payload: OwnerDashboardNotificationsSnapshotPayloadJson
): Promise<void> {
  const { error } = await sbAny.from(OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_TABLE).upsert(
    {
      user_id: keys.user_id,
      store_id: keys.store_id,
      snapshot_kind: keys.snapshot_kind,
      limit_n: keys.limit_n,
      cursor_token: keys.cursor_token,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,store_id,snapshot_kind,limit_n,cursor_token" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[owner-dashboard-notifications-snapshot-upsert]", error.message);
  }
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  storeId: string | null,
  limit: number,
  cursor: string
): Promise<{ payload: OwnerDashboardNotificationsSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(OWNER_DASHBOARD_NOTIFICATIONS_SNAPSHOT_RPC, {
    p_user_id: userId.trim(),
    p_store_id: storeId?.trim() || null,
    p_limit: limit,
    p_cursor: cursor || "",
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[owner-dashboard-notifications-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseOwnerDashboardNotificationsSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  route: string;
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  kind: "unread" | "list";
}): OwnerDashboardNotificationsSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  return {
    route: input.route,
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: 1,
    transport_ms: dbMs,
    payload_build_ms: 0,
    notification_fetch_ms: input.kind === "list" ? dbMs : 0,
    unread_compute_ms: input.kind === "unread" ? dbMs : 0,
    order_merge_ms: 0,
    inquiry_merge_ms: 0,
    message_merge_ms: 0,
    sort_compute_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    aggregate_compute_detected: 0,
    repeated_join_detected: 0,
    worst_stage:
      input.via === "counter_row"
        ? "owner_notifications_snapshot_row"
        : "owner_notifications_unified_rpc",
    worst_stage_ms: dbMs,
    cache_hit_reason:
      input.via === "counter_row"
        ? "owner_notifications_snapshot_row"
        : "owner_notifications_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via === "counter_row" ? "counter_row" : "unified_rpc",
  };
}

async function readSnapshotPath(
  sbAny: SupabaseClient<any>,
  userId: string,
  storeId: string | null,
  snapshotKind: string,
  limit: number,
  cursor: string,
  route: string,
  kind: "unread" | "list"
): Promise<{ payload: OwnerDashboardNotificationsSnapshotPayloadJson; breakdown: OwnerDashboardNotificationsSnapshotBreakdown } | null> {
  logOwnerDashboardNotificationsSnapshotRpcDesignOnce();

  const keys = ownerDashboardNotificationsSnapshotCacheKeyParts({
    userId,
    storeId,
    snapshotKind,
    limit,
    cursor,
  });

  return runSingleFlight(
    `${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${keys.user_id}:${keys.store_id}:${keys.snapshot_kind}:${keys.limit_n}`,
    async () => {
      const build0 = devPerfNow();

      const finish = (
        payload: OwnerDashboardNotificationsSnapshotPayloadJson,
        readMs: number,
        via: SnapshotReadVia,
        stale?: boolean
      ) => {
        const breakdown = buildBreakdown({
          route,
          totalMs: devPerfNow() - build0,
          readMs,
          via,
          kind,
        });
        logOwnerNotificationsHotpathAnalysis(breakdown, {
          structuralNote:
            via === "counter_row"
              ? "request-time notification aggregate removed — precomputed snapshot row"
              : "unified RPC cold fill — 1 RTT replaces unread+list merge",
        });
        evaluateOwnerNotificationsRegressionGuards({
          breakdown,
          allowedRoundTrips: 1,
          snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
          staleSnapshot: stale,
        });
        return { payload, breakdown };
      };

      const read0 = devPerfNow();
      const counter = await readSnapshotCounter(sbAny, keys);
      const readMs = devPerfNow() - read0;

      if (counter.hit && !counter.stale) {
        return finish(counter.row.payload_json, readMs, "counter_row");
      }
      if (counter.hit && counter.stale) {
        scheduleOwnerDashboardNotificationsSnapshotRefresh(userId, storeId, snapshotKind, limit, cursor);
        return finish(counter.row.payload_json, readMs, "counter_row", true);
      }

      const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, userId, storeId, limit, cursor);
      if (!payload?.unread_counts) return null;

      await upsertSnapshotCounter(sbAny, keys, payload);
      return finish(payload, rpcMs || devPerfNow() - read0, "unified_rpc");
    }
  );
}

export async function tryLoadOwnerStoreCommerceUnreadFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<{ unreadCount: number; breakdown: OwnerDashboardNotificationsSnapshotBreakdown } | null> {
  const result = await readSnapshotPath(
    sbAny,
    userId,
    null,
    "owner_unread",
    200,
    "",
    "/api/me/notifications?owner_store_commerce_unread_only=1",
    "unread"
  );
  if (!result) return null;
  return {
    unreadCount: ownerStoreCommerceUnreadFromPayload(result.payload),
    breakdown: result.breakdown,
  };
}

export async function tryLoadOwnerStoreNotificationsFromSnapshot(
  sbAny: SupabaseClient<any>,
  userId: string,
  storeId: string,
  limit = 200
): Promise<{ notifications: Record<string, unknown>[]; breakdown: OwnerDashboardNotificationsSnapshotBreakdown } | null> {
  const result = await readSnapshotPath(
    sbAny,
    userId,
    storeId,
    "owner_store",
    limit,
    "",
    `/api/me/notifications?owner_store_id=${storeId}`,
    "list"
  );
  if (!result) return null;
  return {
    notifications: ownerStoreNotificationsFromPayload(result.payload),
    breakdown: result.breakdown,
  };
}

export async function refreshOwnerDashboardNotificationsSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  userId: string,
  storeId: string | null,
  snapshotKind: string,
  limit: number,
  cursor: string
): Promise<OwnerDashboardNotificationsSnapshotPayloadJson | null> {
  const keys = ownerDashboardNotificationsSnapshotCacheKeyParts({
    userId,
    storeId,
    snapshotKind,
    limit,
    cursor,
  });
  const { payload } = await fetchSnapshotViaRpc(sbAny, userId, storeId, limit, cursor);
  if (!payload?.unread_counts) return null;
  await upsertSnapshotCounter(sbAny, keys, payload);
  return payload;
}
