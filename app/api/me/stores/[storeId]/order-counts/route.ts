import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { fetchOwnerStoreOrderCountsWithMeta } from "@/lib/stores/fetch-owner-store-order-counts";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getCachedStoreOrderCounts,
  type StoreOrderCountsPayload,
} from "@/lib/stores/store-order-counts-cache";
import {
  peekOwnerStoreOwnershipCacheHit,
  seedOwnerStoreOwnershipCache,
} from "@/lib/stores/owner-store-ownership-cache";
import {
  buildOwnerDashboardPerfV2,
  logOwnerDashboardPerfV2,
} from "@/lib/stores/owner-dashboard-perf-v2";
import {
  invalidateStoreOrderCountsCache,
  peekStoreOrderCountsCacheHit,
  peekStoreOrderCountsInflight,
} from "@/lib/stores/store-order-counts-cache";
import {
  emptyOrderCountsColdBreakdown,
  logOrderCountsColdBreakdown,
  pickOrderCountsSlowestStage,
} from "@/lib/stores/order-counts-cold-breakdown";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/me/stores/[storeId]/order-counts";

/** 매장 오너: 접수 대기·동네배달·환불 요청 카운트 (허브 배지·알림용) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  let auth_ms = 0;
  let count_ms = 0;
  let cache_hit: 0 | 1 = 0;

  const auth0 = perfNowMs();
  const userId = await getRouteUserId();
  auth_ms = Math.round(perfNowMs() - auth0);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  if (
    process.env.NODE_ENV === "development" &&
    _req.headers.get("x-samarket-owner-dashboard-measure") === "1"
  ) {
    invalidateStoreOrderCountsCache(id);
  }

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);
  const countsInflightBefore = !peekStoreOrderCountsCacheHit(id) && peekStoreOrderCountsInflight(id);

  const cacheLookup0 = perfNowMs();
  const countsCacheHitBefore = peekStoreOrderCountsCacheHit(id);
  const coldBreakdown = emptyOrderCountsColdBreakdown();
  coldBreakdown.cache_lookup_ms = Math.round(perfNowMs() - cacheLookup0);

  let orderCountsVia: "rpc_snapshot" | "rpc" | "legacy" = "legacy";
  let fallbackUsed: 0 | 1 = 1;
  let orderCountRpcMs = 0;

  let countsResult: Awaited<ReturnType<typeof getCachedStoreOrderCounts>>;
  if (countsCacheHitBefore) {
    const cache0 = perfNowMs();
    countsResult = await getCachedStoreOrderCounts(id, async () => {
      throw new Error("order_counts_cache_invariant");
    });
    count_ms = Math.round(perfNowMs() - cache0);
  } else {
    const fetched = await fetchOwnerStoreOrderCountsWithMeta(sb, id, userId, coldBreakdown);
    if ("gate" in fetched) {
      return NextResponse.json({ ok: false, error: fetched.gate.error }, { status: fetched.gate.status });
    }
    orderCountsVia = fetched.via;
    fallbackUsed = fetched.via === "legacy" ? 1 : 0;
    orderCountRpcMs = coldBreakdown.rpc_wall_ms;
    if (fetched.via === "rpc_snapshot") {
      seedOwnerStoreOwnershipCache(userId, id, {
        ok: true,
        store: {
          id,
          owner_user_id: userId,
          approval_status: "approved",
          owner_can_edit_store_identity: true,
        },
      });
    }
    const snapshotPayload: StoreOrderCountsPayload = { ok: true as const, ...fetched.snapshot };
    const cacheStore0 = perfNowMs();
    countsResult = await getCachedStoreOrderCounts(id, async () => snapshotPayload);
    coldBreakdown.cache_store_ms = Math.round(perfNowMs() - cacheStore0);
    count_ms = orderCountRpcMs + coldBreakdown.cache_store_ms;
  }

  const { payload: body, cache_hit: countsCacheHit } = countsResult;
  cache_hit = countsCacheHit ? 1 : 0;
  const total_ms = Math.round(perfNowMs() - wall0);

  if (!cache_hit) {
    coldBreakdown.order_counts_slowest_stage = pickOrderCountsSlowestStage(coldBreakdown);
    logOrderCountsColdBreakdown(id, orderCountsVia, coldBreakdown);
  }

  logOwnerDashboardPerf({
    route: ROUTE,
    store_id: id,
    total_ms,
    auth_ms,
    ownership_ms: 0,
    db_ms: count_ms,
    count_ms,
    cache_hit,
    ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    result_count: 3,
    payload_bytes: jsonPayloadBytes(body),
  });

  logOwnerDashboardPerfV2(
    buildOwnerDashboardPerfV2({
      route: ROUTE,
      store_id: id,
      total_ms,
      auth_ms,
      ownership_ms: 0,
      order_count_rpc_ms: cache_hit ? count_ms : orderCountRpcMs || coldBreakdown.rpc_wall_ms,
      cache_hit,
      singleflight_hit: countsInflightBefore ? 1 : 0,
      fallback_used: cache_hit ? undefined : fallbackUsed,
      order_counts_via: cache_hit ? undefined : orderCountsVia,
      first_paint_blocking: _req.headers.get("x-samarket-first-paint-blocking") !== "0",
      db_round_trips: cache_hit ? 0 : orderCountsVia === "rpc_snapshot" ? 1 : 2,
      ...(cache_hit
        ? {}
        : {
            ownership_check_ms: coldBreakdown.ownership_check_ms,
            store_ops_meta_ms: coldBreakdown.store_ops_meta_ms,
            rpc_wall_ms: coldBreakdown.rpc_wall_ms,
            rpc_parse_ms: coldBreakdown.rpc_parse_ms,
            cache_lookup_ms: coldBreakdown.cache_lookup_ms,
            cache_store_ms: coldBreakdown.cache_store_ms,
            order_counts_cold_parallel_wall_ms: coldBreakdown.order_counts_cold_parallel_wall_ms,
            order_counts_slowest_stage: coldBreakdown.order_counts_slowest_stage,
          }),
      stages: cache_hit
        ? [{ stage: "cache", ms: count_ms }]
        : [
            { stage: "rpc_wall", ms: coldBreakdown.rpc_wall_ms },
            { stage: "rpc_parse", ms: coldBreakdown.rpc_parse_ms },
            { stage: "store_ops_meta", ms: coldBreakdown.store_ops_meta_ms },
          ],
    })
  );

  return NextResponse.json(body);
}
