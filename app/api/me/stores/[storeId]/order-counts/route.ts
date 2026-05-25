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
  primeStoreOrderCountsCache,
} from "@/lib/stores/store-order-counts-cache";
import {
  buildPerfMeasureResponseHeaders,
  isOwnerDashboardMeasureInvalidateEnabled,
} from "@/lib/performance/prod-same-region-perf";
import {
  emptyOrderCountsColdBreakdown,
  logOrderCountsColdBreakdown,
} from "@/lib/stores/order-counts-cold-breakdown";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";
import { buildSnapshotSignoffHeaders } from "@/lib/http/snapshot-signoff-response-headers";
import {
  deliverySummarySignoffObs,
  type DeliverySummaryOrderCountsVia,
} from "@/lib/stores/delivery-summary-signoff-observability";

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
    isOwnerDashboardMeasureInvalidateEnabled() &&
    _req.headers.get("x-samarket-owner-dashboard-measure") === "1"
  ) {
    invalidateStoreOrderCountsCache(id, userId);
  }

  const deliverySummaryBypass =
    new URL(_req.url).searchParams.get("deliverySummaryBypass") === "1" &&
    process.env.NODE_ENV === "development";
  if (deliverySummaryBypass) {
    invalidateStoreOrderCountsCache(id, userId);
  }

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);
  const countsInflightBefore = !peekStoreOrderCountsCacheHit(id) && peekStoreOrderCountsInflight(id);

  const cacheLookup0 = perfNowMs();
  const countsCacheHitBefore = peekStoreOrderCountsCacheHit(id);
  const coldBreakdown = emptyOrderCountsColdBreakdown();
  coldBreakdown.auth_ms = auth_ms;
  coldBreakdown.ownership_ms = ownershipCachedBefore ? 0 : 0;
  coldBreakdown.cache_lookup_ms = Math.round(perfNowMs() - cacheLookup0);

  let orderCountsVia: DeliverySummaryOrderCountsVia = "delivery_summary_snapshot";
  let fallbackUsed: 0 | 1 = 0;
  let orderCountRpcMs = 0;

  let countsResult: Awaited<ReturnType<typeof getCachedStoreOrderCounts>>;
  if (countsCacheHitBefore) {
    const cache0 = perfNowMs();
    countsResult = await getCachedStoreOrderCounts(id, async () => {
      throw new Error("order_counts_cache_invariant");
    });
    orderCountsVia = countsResult.via ?? "delivery_summary_snapshot";
    count_ms = Math.round(perfNowMs() - cache0);
  } else {
    const fetched = await fetchOwnerStoreOrderCountsWithMeta(sb, id, userId, coldBreakdown);
    if ("gate" in fetched) {
      const gateStatus = fetched.gate.status;
      if (gateStatus === 403 || gateStatus === 401) {
        return NextResponse.json(
          { ok: false, error: fetched.gate.error },
          {
            status: gateStatus,
            headers: buildSnapshotSignoffHeaders("delivery-summary", {
              snapshotPath: false,
              queryWave2Ms: 0,
              rpcRemoved: 0,
              fallbackUsed: 0,
              authBlocked: 1,
            }),
          }
        );
      }
      return NextResponse.json({ ok: false, error: fetched.gate.error }, { status: gateStatus });
    }
    orderCountsVia = fetched.via;
    fallbackUsed = fetched.via === "delivery_summary_snapshot" ? 0 : 1;
    orderCountRpcMs = coldBreakdown.rpc_wall_ms;
    const payloadBuild0 = perfNowMs();
    const snapshotPayload: StoreOrderCountsPayload = { ok: true as const, ...fetched.snapshot };
    coldBreakdown.payload_build_ms = Math.round(perfNowMs() - payloadBuild0);

    const cacheSet0 = perfNowMs();
    primeStoreOrderCountsCache(id, snapshotPayload, fetched.via);
    coldBreakdown.cache_set_ms = Math.round(perfNowMs() - cacheSet0);
    coldBreakdown.cache_store_ms = coldBreakdown.cache_set_ms;

    countsResult = { payload: snapshotPayload, cache_hit: false };
    count_ms = orderCountRpcMs + coldBreakdown.cache_set_ms + coldBreakdown.payload_build_ms;

    if (fetched.via === "delivery_summary_snapshot") {
      queueMicrotask(() => {
        seedOwnerStoreOwnershipCache(userId, id, {
          ok: true,
          store: {
            id,
            owner_user_id: userId,
            approval_status: "approved",
            owner_can_edit_store_identity: true,
          },
        });
      });
    }
  }

  const { payload: body, cache_hit: countsCacheHit } = countsResult;
  cache_hit = countsCacheHit ? 1 : 0;
  const total_ms = Math.round(perfNowMs() - wall0);

  if (!cache_hit) {
    coldBreakdown.response_return_ms = Math.round(perfNowMs() - wall0);
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
      db_round_trips: cache_hit
        ? 0
        : orderCountsVia === "delivery_summary_snapshot"
          ? 1
          : 2,
      ...(cache_hit
        ? {}
        : {
            ownership_check_ms: coldBreakdown.ownership_check_ms,
            store_ops_meta_ms: coldBreakdown.store_ops_meta_ms,
            rpc_wall_ms: coldBreakdown.rpc_wall_ms,
            rpc_parse_ms: coldBreakdown.rpc_parse_ms,
            auth_ms: coldBreakdown.auth_ms,
            ownership_ms: coldBreakdown.ownership_ms,
            cache_lookup_ms: coldBreakdown.cache_lookup_ms,
            cache_set_ms: coldBreakdown.cache_set_ms,
            payload_build_ms: coldBreakdown.payload_build_ms,
            rpc_transport_estimated_ms: coldBreakdown.rpc_transport_estimated_ms,
            rpc_estimated_db_ms: coldBreakdown.rpc_estimated_db_ms,
            rpc_rtt_limited: coldBreakdown.rpc_rtt_limited ? 1 : 0,
            cold_bottleneck_cause: coldBreakdown.cold_bottleneck_cause,
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

  return NextResponse.json(body, {
    headers: {
      ...buildPerfMeasureResponseHeaders({
        actual_handler_ms: total_ms,
        cache_hit,
        transport_ms: coldBreakdown.rpc_transport_estimated_ms,
        db_execution_ms: coldBreakdown.rpc_estimated_db_ms,
      }),
      ...buildSnapshotSignoffHeaders(
        "delivery-summary",
        deliverySummarySignoffObs(orderCountsVia, cache_hit === 1)
      ),
    },
  });
}
