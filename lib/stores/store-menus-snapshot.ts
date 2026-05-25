/**
 * Store menus snapshot — read path (counter row → unified RPC).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";
import {
  parseStoreMenusSnapshotPayload,
  parseStoreMenusSnapshotRpcData,
  type StoreMenusSnapshotPayloadJson,
} from "@/lib/stores/store-menus-snapshot-assemble";
import {
  STORE_MENUS_SNAPSHOT_MENU_VERSION,
  STORE_MENUS_SNAPSHOT_TABLE,
  storeMenusSnapshotCacheKeyParts,
  storeMenusSnapshotCounterTtlMs,
} from "@/lib/stores/store-menus-snapshot-counter";
import { scheduleStoreMenusSnapshotRefresh } from "@/lib/stores/store-menus-snapshot-refresh";
import {
  evaluateStoreMenusRegressionGuards,
  type StoreMenusSnapshotBreakdown,
} from "@/lib/stores/store-menus-regression-guard";
import {
  countMenusCatalogStats,
  logMenusColdFillDeferredCounterUpsert,
  setLastMenusColdFillServerPartial,
  type MenusColdFillSnapshotVia,
} from "@/lib/stores/menus-cold-fill-deep-breakdown";
import {
  logMenusHotpathAnalysis,
  logStoreMenusSnapshotRpcDesignOnce,
} from "@/lib/stores/store-menus-hotpath-analysis";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const STORE_MENUS_SNAPSHOT_RPC = "get_store_menus_snapshot";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "store-menus-snapshot:";

type SnapshotReadVia = "counter_row" | "unified_rpc";

type SnapshotRow = {
  menu_version: string;
  payload_json: StoreMenusSnapshotPayloadJson;
  updated_at: string;
};

function counterSelectFields(): string {
  return ["store_slug", "viewer_user_id", "menu_version", "payload_json", "updated_at"].join(",");
}

function rowFromDb(data: Record<string, unknown>): SnapshotRow | null {
  if (!data.updated_at || typeof data.updated_at !== "string") return null;
  const payload = data.payload_json;
  if (!payload || typeof payload !== "object") return null;
  return {
    menu_version: typeof data.menu_version === "string" ? data.menu_version : STORE_MENUS_SNAPSHOT_MENU_VERSION,
    payload_json: payload as StoreMenusSnapshotPayloadJson,
    updated_at: data.updated_at,
  };
}

async function readSnapshotCounter(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null,
  menuVersion: string
): Promise<
  | { hit: false; reason: "missing" | "stale" | "no_column" | "error" }
  | { hit: true; row: SnapshotRow; ageMs: number; stale: boolean }
> {
  const keys = storeMenusSnapshotCacheKeyParts(storeSlug, viewerUserId, menuVersion);
  const { data, error } = await sbAny
    .from(STORE_MENUS_SNAPSHOT_TABLE)
    .select(counterSelectFields())
    .eq("store_slug", keys.store_slug)
    .eq("viewer_user_id", keys.viewer_user_id)
    .eq("menu_version", keys.menu_version)
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
  return { hit: true, row, ageMs, stale: ageMs > storeMenusSnapshotCounterTtlMs() };
}

async function upsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null,
  menuVersion: string,
  payload: StoreMenusSnapshotPayloadJson
): Promise<void> {
  const keys = storeMenusSnapshotCacheKeyParts(storeSlug, viewerUserId, menuVersion);
  const { error } = await sbAny.from(STORE_MENUS_SNAPSHOT_TABLE).upsert(
    {
      store_slug: keys.store_slug,
      viewer_user_id: keys.viewer_user_id,
      menu_version: keys.menu_version,
      payload_json: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_slug,viewer_user_id,menu_version" }
  );
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot upsert probe
    console.warn("[store-menus-snapshot-upsert]", error.message);
  }
}

/** Cold unified RPC — counter row upsert는 응답 shape·semantics 와 무관. 응답 return 후 비블로킹. */
function deferUpsertSnapshotCounter(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null,
  menuVersion: string,
  payload: StoreMenusSnapshotPayloadJson
): void {
  const upsert0 = devPerfNow();
  void upsertSnapshotCounter(sbAny, storeSlug, viewerUserId, menuVersion, payload)
    .then(() => {
      logMenusColdFillDeferredCounterUpsert({
        slug: storeSlug.trim().toLowerCase(),
        counter_upsert_deferred_ms: Math.round(devPerfNow() - upsert0),
        counter_upsert_deferred: true,
      });
    })
    .catch((err) => {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- deferred snapshot upsert probe
        console.warn(
          "[store-menus-snapshot-upsert-deferred]",
          err instanceof Error ? err.message : err
        );
      }
    });
}

async function fetchSnapshotViaRpc(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null,
  menuVersion: string
): Promise<{ payload: StoreMenusSnapshotPayloadJson | null; rpcMs: number }> {
  const rpc0 = devPerfNow();
  const { data, error } = await sbAny.rpc(STORE_MENUS_SNAPSHOT_RPC, {
    p_store_slug: storeSlug.trim(),
    p_user_id: viewerUserId?.trim() || null,
    p_menu_version: menuVersion,
  });
  const rpcMs = devPerfNow() - rpc0;
  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- unified RPC deploy probe
      console.warn("[store-menus-snapshot-rpc-miss]", error.message);
    }
    return { payload: null, rpcMs };
  }
  return { payload: parseStoreMenusSnapshotRpcData(data), rpcMs };
}

function buildBreakdown(input: {
  slug: string;
  totalMs: number;
  readMs: number;
  via: SnapshotReadVia;
  sortComputeMs?: number;
}): StoreMenusSnapshotBreakdown {
  const dbMs = Math.round(input.readMs);
  const sortMs = Math.round(input.sortComputeMs ?? 0);
  return {
    route: `/api/stores/${input.slug}/menus`,
    slug: input.slug.trim().toLowerCase(),
    total_ms: Math.round(input.totalMs),
    db_ms: dbMs,
    round_trips: 1,
    transport_ms: dbMs,
    payload_build_ms: sortMs,
    products_fetch_ms: 0,
    category_fetch_ms: 0,
    popular_stats_ms: 0,
    recommended_fetch_ms: 0,
    options_fetch_ms: 0,
    sort_compute_ms: sortMs,
    image_hydration_ms: 0,
    cache_hit: input.via === "counter_row" ? 1 : 0,
    wave_count: 1,
    query_wave_2_ms: 0,
    sequential_await_detected: 0,
    aggregate_compute_detected: 0,
    repeated_join_detected: 0,
    worst_stage: input.via === "counter_row" ? "store_menus_snapshot_row" : "store_menus_unified_rpc",
    worst_stage_ms: dbMs,
    cache_hit_reason: input.via === "counter_row" ? "store_menus_snapshot_row" : "store_menus_unified_rpc",
    rpc_removed: 1,
    snapshot_via: input.via === "counter_row" ? "counter_row" : "unified_rpc",
  };
}

export type StoreMenusSnapshotCatalogResult = {
  body: StoreMenusCatalogBody;
  breakdown: StoreMenusSnapshotBreakdown;
};

/** Snapshot-only menus catalog — null = RPC miss or store not in snapshot payload. */
export async function tryLoadStoreMenusCatalogFromSnapshot(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null,
  startedAt: number
): Promise<StoreMenusSnapshotCatalogResult | null> {
  const slug = storeSlug.trim();
  if (!slug) return null;

  logStoreMenusSnapshotRpcDesignOnce();
  const menuVersion = STORE_MENUS_SNAPSHOT_MENU_VERSION;

  return runSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${slug}:${viewerUserId ?? "anon"}`, async () => {
    const build0 = devPerfNow();

    const finish = (
      payload: StoreMenusSnapshotPayloadJson,
      readMs: number,
      via: SnapshotReadVia,
      stale?: boolean,
      timing?: {
        snapshotRowLookupMs: number;
        unifiedRpcMs?: number;
        counterUpsertDeferred?: boolean;
      }
    ): StoreMenusSnapshotCatalogResult | null => {
      const sort0 = devPerfNow();
      const body = parseStoreMenusSnapshotPayload(payload);
      const sortMs = devPerfNow() - sort0;
      if (!body) return null;
      const counts = countMenusCatalogStats(body);
      const snapshotVia: MenusColdFillSnapshotVia =
        via === "counter_row" ? "counter_row" : "unified_rpc";
      const unifiedRpcMs = Math.round(timing?.unifiedRpcMs ?? (via === "unified_rpc" ? readMs : 0));
      const snapshotRowLookupMs = Math.round(timing?.snapshotRowLookupMs ?? 0);
      setLastMenusColdFillServerPartial({
        rpc_ms: unifiedRpcMs,
        unified_rpc_ms: unifiedRpcMs,
        cache_lookup_ms: snapshotRowLookupMs,
        memory_cache_lookup_ms: 0,
        snapshot_row_lookup_ms: snapshotRowLookupMs,
        payload_build_ms: Math.round(sortMs),
        menu_count: counts.menu_count,
        option_count: counts.option_count,
        image_url_count: counts.image_url_count,
        snapshot_via: snapshotVia,
        worst_stage: via === "counter_row" ? "store_menus_snapshot_row" : "store_menus_unified_rpc",
        cache_hit: via === "counter_row" ? 1 : 0,
        counter_upsert_blocking_ms: 0,
        counter_upsert_deferred: timing?.counterUpsertDeferred === true,
        response_unblocked_by_counter: true,
      });
      const breakdown = buildBreakdown({
        slug,
        totalMs: devPerfNow() - build0,
        readMs,
        via,
        sortComputeMs: sortMs,
      });
      logMenusHotpathAnalysis(breakdown, {
        structuralNote:
          via === "counter_row"
            ? "request-time multi-wave removed — precomputed menu snapshot row + CPU sort/popular ids"
            : "unified RPC cold fill — 1 RTT replaces store+products+popular+meta parallel wave",
      });
      evaluateStoreMenusRegressionGuards({
        breakdown,
        allowedRoundTrips: 1,
        snapshotVia: via === "counter_row" ? "counter_row" : "unified_rpc",
        staleSnapshot: stale,
      });
      void startedAt;
      return { body, breakdown };
    };

    const read0 = devPerfNow();
    const counter = await readSnapshotCounter(sbAny, slug, viewerUserId, menuVersion);
    const snapshotRowLookupMs = devPerfNow() - read0;

    if (counter.hit && !counter.stale) {
      const done = finish(counter.row.payload_json, snapshotRowLookupMs, "counter_row", false, {
        snapshotRowLookupMs,
      });
      if (done) return done;
    }
    if (counter.hit && counter.stale) {
      scheduleStoreMenusSnapshotRefresh(slug, viewerUserId);
      const done = finish(counter.row.payload_json, snapshotRowLookupMs, "counter_row", true, {
        snapshotRowLookupMs,
      });
      if (done) return done;
    }

    const { payload, rpcMs } = await fetchSnapshotViaRpc(sbAny, slug, viewerUserId, menuVersion);
    if (!payload?.store) return null;

    const done = finish(payload, rpcMs || devPerfNow() - read0, "unified_rpc", false, {
      snapshotRowLookupMs,
      unifiedRpcMs: rpcMs,
      counterUpsertDeferred: true,
    });
    if (done) {
      deferUpsertSnapshotCounter(sbAny, slug, viewerUserId, menuVersion, payload);
    }
    return done;
  });
}

export async function refreshStoreMenusSnapshotFromRpc(
  sbAny: SupabaseClient<any>,
  storeSlug: string,
  viewerUserId: string | null
): Promise<StoreMenusSnapshotPayloadJson | null> {
  const { payload } = await fetchSnapshotViaRpc(
    sbAny,
    storeSlug,
    viewerUserId,
    STORE_MENUS_SNAPSHOT_MENU_VERSION
  );
  if (!payload?.store) return null;
  await upsertSnapshotCounter(
    sbAny,
    storeSlug,
    viewerUserId,
    STORE_MENUS_SNAPSHOT_MENU_VERSION,
    payload
  );
  return payload;
}
