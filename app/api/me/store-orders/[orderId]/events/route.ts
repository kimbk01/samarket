import { NextResponse } from "next/server";
import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import { isStoreOrderEventVisibleToBuyer } from "@/lib/stores/store-order-event-audience";
import { resolveStoreOrderEventOwnershipCached } from "@/lib/stores/store-order-event-ownership-cache";
import {
  peekStoreOrderEventsReadCacheMeta,
  setStoreOrderEventsReadCache,
  storeOrderEventsReadCacheKey,
  storeOrderEventsReadCacheKeyShort,
} from "@/lib/stores/store-order-events-read-cache";
import { perfNowMs } from "@/lib/stores/store-order-detail-perf";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS_SELECT =
  "id, order_id, store_id, actor_user_id, actor_role, event_type, from_status, to_status, message, metadata, created_at";

/**
 * 구매자 또는 해당 매장 오너: 주문 이벤트 타임라인(append-only 원장 조회).
 * 구매자 요청(buyer_user_id 일치) 시 매장 전용 이벤트(metadata.audience=owner 등)는 제외.
 * 오너만 접근 시(구매자 아님) 전체 원장 반환 — 운영 타임라인.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const wall0 = perfNowMs();
  const auth = await ensureApiRouteAuthGate();
  const auth_ms = auth.auth_ms;
  const auth_cache_hit = auth.auth_cache_hit;
  const auth_source = auth.auth_source;
  if (!auth.ok) return auth.response;

  const userId = auth.userId;
  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ownership = await resolveStoreOrderEventOwnershipCached(sb, userId, oid);
  const ownership_ms = ownership.ownership_ms;
  const ownership_cache_hit = ownership.ownership_cache_hit;
  if (!ownership.ok) {
    if (ownership.status === 404) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const buyerOk = ownership.buyerOk;
  const audience = ownership.audience;

  const cacheKey = storeOrderEventsReadCacheKey({
    viewerUserId: userId,
    orderId: oid,
    audience,
  });
  const cachePeek = peekStoreOrderEventsReadCacheMeta(cacheKey, oid);
  if (cachePeek.hit && cachePeek.body) {
    const total_ms = Math.round(perfNowMs() - wall0);
    if (process.env.NODE_ENV === "development") {
      logRoutePerf({
        route: "GET /api/me/store-orders/[orderId]/events",
        total_ms,
        auth_ms,
        auth_cache_hit,
        auth_source,
        ownership_ms,
        ownership_cache_hit,
        events_fetch_ms: 0,
        cache_hit: 1,
        cache_age_ms: cachePeek.cache_age_ms,
        events_cache_key_short: storeOrderEventsReadCacheKeyShort(cacheKey),
        events_count: cachePeek.body.events.length,
      });
    }
    return NextResponse.json(cachePeek.body);
  }

  const tFetch0 = perfNowMs();
  const { data: rows, error: eErr } = await sb
    .from("store_order_events")
    .select(EVENTS_SELECT)
    .eq("order_id", oid)
    .order("created_at", { ascending: true });
  const events_fetch_ms = Math.round(perfNowMs() - tFetch0);

  if (eErr) {
    if (/does not exist|Could not find the table/i.test(String(eErr.message))) {
      return NextResponse.json({ ok: true, events: [] });
    }
    console.error("[GET store-order-events]", eErr);
    return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
  }

  const list = rows ?? [];
  const events = buyerOk
    ? list.filter((row) =>
        isStoreOrderEventVisibleToBuyer(
          row as Parameters<typeof isStoreOrderEventVisibleToBuyer>[0]
        )
      )
    : list;
  const body = { ok: true as const, events };
  setStoreOrderEventsReadCache(cacheKey, body, "read_fetch");

  const total_ms = Math.round(perfNowMs() - wall0);
  const invalidate_reason = cachePeek.miss_reason;
  if (process.env.NODE_ENV === "development") {
    logRoutePerf({
      route: "GET /api/me/store-orders/[orderId]/events",
      total_ms,
      auth_ms,
      auth_cache_hit,
      auth_source,
      ownership_ms,
      ownership_cache_hit,
      events_fetch_ms,
      cache_hit: 0,
      cache_age_ms: 0,
      invalidate_reason,
      events_cache_key_short: storeOrderEventsReadCacheKeyShort(cacheKey),
      events_count: events.length,
    });
  }

  return NextResponse.json(body);
}
