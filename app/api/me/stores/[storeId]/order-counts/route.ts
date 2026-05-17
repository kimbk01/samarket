import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getCachedStoreOrderCounts,
  type StoreOrderCountsPayload,
} from "@/lib/stores/store-order-counts-cache";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
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
  let ownership_ms = 0;
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

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);

  const own0 = perfNowMs();
  const counts0 = perfNowMs();
  const [gate, countsResult] = await Promise.all([
    getCachedStoreIfOwner(sb, userId, id),
    getCachedStoreOrderCounts(id, async (): Promise<StoreOrderCountsPayload> => {
      const counts = await fetchOwnerStoreOrderCounts(sb, id);
      return { ok: true as const, ...counts };
    }),
  ]);
  ownership_ms = Math.round(perfNowMs() - own0);
  count_ms = Math.round(perfNowMs() - counts0);

  if (!gate.ok) {
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      cache_hit: 0,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    });
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { payload: body, cache_hit: countsCacheHit } = countsResult;
  cache_hit = countsCacheHit ? 1 : 0;
  const total_ms = Math.round(perfNowMs() - wall0);

  logOwnerDashboardPerf({
    route: ROUTE,
    store_id: id,
    total_ms,
    auth_ms,
    ownership_ms,
    db_ms: count_ms,
    count_ms,
    cache_hit,
    ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    result_count: 3,
    payload_bytes: jsonPayloadBytes(body),
  });

  return NextResponse.json(body);
}
