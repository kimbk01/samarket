import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { ownerAcceptRequiresRecordedPayment } from "@/lib/stores/owner-order-payment-policy";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import {
  getCachedStoreOrderCounts,
  type StoreOrderCountsPayload,
} from "@/lib/stores/store-order-counts-cache";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";
import { logOwnerOrdersListPerf } from "@/lib/stores/owner-orders-list-perf";
import {
  peekOwnerStoreOrdersListServerCache,
  setOwnerStoreOrdersListServerCache,
} from "@/lib/stores/owner-store-orders-list-server-cache";
import { tryLoadOwnerStoreOrdersListFromSnapshot } from "@/lib/stores/owner-store-orders-list-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/me/stores/[storeId]/orders";

function snapshotResponseHeaders(snapshotVia?: string): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-owner-orders-list-snapshot-path": "1",
    "x-samarket-owner-orders-list-snapshot-via": snapshotVia,
    "x-samarket-owner-orders-list-query-wave-2-ms": "0",
    "x-samarket-owner-orders-list-rpc-removed": "1",
  };
}

function pickupLinesFromSnapshot(
  addr: {
    region?: string | null;
    city?: string | null;
    district?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
  } | null | undefined
): string[] {
  if (!addr) return [];
  return formatStorePickupAddressLines({
    region: addr.region,
    city: addr.city,
    district: addr.district,
    address_line1: addr.address_line1,
    address_line2: addr.address_line2,
  });
}

function pickupLinesFromStoreRow(storeAddr: Record<string, unknown> | null | undefined): string[] {
  if (!storeAddr) return [];
  return formatStorePickupAddressLines({
    region: storeAddr.region as string | null | undefined,
    city: storeAddr.city as string | null | undefined,
    district: storeAddr.district as string | null | undefined,
    address_line1: storeAddr.address_line1 as string | null | undefined,
    address_line2: storeAddr.address_line2 as string | null | undefined,
  });
}

/** 매장 오너: 해당 매장 주문 목록 + 라인 (?meta_only=1 이면 목록 없이 meta만) */
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  let auth_ms = 0;
  let ownership_ms = 0;
  let db_ms = 0;
  let count_ms = 0;
  let list_ms = 0;
  let transform_ms = 0;

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

  const url = new URL(req.url);
  const ownerOrdersListBypass =
    url.searchParams.get("ownerOrdersListBypass") === "1" && process.env.NODE_ENV === "development";

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);

  const own0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(sb, userId, id);
  ownership_ms = Math.round(perfNowMs() - own0);
  if (!gate.ok) {
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    });
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const metaOnly = url.searchParams.get("meta_only") === "1";

  if (!metaOnly && !ownerOrdersListBypass) {
    const listCached = peekOwnerStoreOrdersListServerCache(id, userId);
    if (listCached) {
      const body = { ok: true as const, meta: listCached.meta, orders: listCached.orders };
      const total_ms = Math.round(perfNowMs() - wall0);
      logOwnerDashboardPerf({
        route: ROUTE,
        store_id: id,
        total_ms,
        auth_ms,
        ownership_ms,
        db_ms: 0,
        list_ms: 0,
        transform_ms: 0,
        ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
        result_count: listCached.orders.length,
        payload_bytes: jsonPayloadBytes(body),
      });
      logOwnerOrdersListPerf({
        route: ROUTE,
        rpc_ms: 0,
        transform_ms: 0,
        payload_kb: jsonPayloadBytes(body) / 1024,
        normalize_ms: 0,
        attach_ms: 0,
        serialization_ms: 0,
        list_snapshot_hit: 1,
        list_snapshot_singleflight_hit: 0,
        detail_fields_removed: 0,
        db_round_trips: 0,
        buyer_label_cache_hit: 1,
        total_ms,
      });
      return NextResponse.json(body, {
        headers: snapshotResponseHeaders("route_memory_ttl"),
      });
    }
  }

  const db0 = perfNowMs();

  const countPromise = getCachedStoreOrderCounts(id, async (): Promise<StoreOrderCountsPayload> => {
    const counts = await fetchOwnerStoreOrderCounts(sb, id);
    return { ok: true as const, ...counts };
  }).then((r) => r.payload);

  const storeAddrPromise = sb
    .from("stores")
    .select("region, city, district, address_line1, address_line2")
    .eq("id", id)
    .maybeSingle();

  if (metaOnly) {
    const [countsPayload, storeAddrRes] = await Promise.all([countPromise, storeAddrPromise]);
    db_ms = Math.round(perfNowMs() - db0);
    count_ms = db_ms;

    const meta = {
      owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
      refund_requested_count: countsPayload.refund_requested_count,
      pending_accept_count: countsPayload.pending_accept_count,
      pending_delivery_count: countsPayload.pending_delivery_count,
      store_pickup_address_lines: pickupLinesFromStoreRow(storeAddrRes.data as Record<string, unknown> | null),
    };

    const body = { ok: true as const, meta };
    const total_ms = Math.round(perfNowMs() - wall0);
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms,
      auth_ms,
      ownership_ms,
      db_ms,
      count_ms,
      meta_only: 1,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
      result_count: 0,
      payload_bytes: jsonPayloadBytes(body),
    });
    return NextResponse.json(body);
  }

  const snapPromise = tryLoadOwnerStoreOrdersListFromSnapshot(sb as never, id, userId);

  let orders: import("@/lib/business/owner-store-order-list-row-bridge").OwnerStoreOrderListRow[] = [];
  let snapshotVia: string | undefined;
  let normalize_ms = 0;
  let attach_ms = 0;
  let buyer_label_cache_hit = 0;
  let db_round_trips = 0;
  let list_snapshot_hit: 0 | 1 = 0;

  const [snap, countsPayload, storeAddrRes] = await Promise.all([
    snapPromise,
    countPromise,
    storeAddrPromise,
  ]);

  db_ms = Math.round(perfNowMs() - db0);
  count_ms = db_ms;

  if (snap) {
    orders = snap.orders;
    list_ms = snap.breakdown.orders_fetch_ms;
    db_round_trips = snap.breakdown.round_trips;
    list_snapshot_hit = 1;
    snapshotVia = snap.snapshotVia;
  } else {
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      db_ms,
    });
    return NextResponse.json(
      { ok: false, error: "snapshot_unavailable" },
      { status: 503 }
    );
  }

  const store_pickup_address_lines = snap
    ? pickupLinesFromSnapshot(snap.storePickupAddress)
    : pickupLinesFromStoreRow(storeAddrRes.data as Record<string, unknown> | null);

  const meta = {
    owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
    refund_requested_count: snap?.statusCounts.refund_requested_count ?? countsPayload.refund_requested_count,
    pending_accept_count: snap?.statusCounts.pending_accept_count ?? countsPayload.pending_accept_count,
    pending_delivery_count: snap?.statusCounts.pending_delivery_count ?? countsPayload.pending_delivery_count,
    store_pickup_address_lines,
  };

  const body = { ok: true as const, meta, orders };
  const total_ms = Math.round(perfNowMs() - wall0);

  setOwnerStoreOrdersListServerCache(id, userId, {
    ok: true,
    orders: orders as import("@/lib/business/owner-store-order-list-row-bridge").OwnerStoreOrderListRow[],
    meta: {
      pending_accept_count: meta.pending_accept_count,
      refund_requested_count: meta.refund_requested_count,
      pending_delivery_count: meta.pending_delivery_count,
    },
  });

  logOwnerOrdersListPerf({
    route: ROUTE,
    rpc_ms: list_ms,
    transform_ms,
    payload_kb: jsonPayloadBytes(body) / 1024,
    normalize_ms,
    attach_ms,
    serialization_ms: 0,
    list_snapshot_hit,
    list_snapshot_singleflight_hit: 0,
    detail_fields_removed: 0,
    db_round_trips,
    buyer_label_cache_hit: buyer_label_cache_hit ? 1 : 0,
    total_ms,
  });

  logOwnerDashboardPerf({
    route: ROUTE,
    store_id: id,
    total_ms,
    auth_ms,
    ownership_ms,
    db_ms,
    count_ms,
    list_ms,
    transform_ms,
    ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    result_count: orders.length,
    payload_bytes: jsonPayloadBytes(body),
  });

  return NextResponse.json(body, { headers: snapshotResponseHeaders(snapshotVia) });
}
