import { NextResponse } from "next/server";
import { resolveRouteMemoryCacheBypass } from "@/lib/http/route-cache-bypass";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  buildDeliveryMenusApiBreakdown,
  logDeliveryMenusApiBreakdown,
} from "@/lib/stores/delivery-menus-api-breakdown";
import { fetchStoreMenusCatalog, type StoreMenusCatalogBody } from "@/lib/stores/fetch-store-menus-catalog";
import { storePublicApiPerfHeaders } from "@/lib/stores/store-public-api-perf-headers";
import {
  readStoreMenusPublicServerCache,
  runStoreMenusPublicServerSingleFlight,
  writeStoreMenusPublicServerCache,
} from "@/lib/stores/store-menus-public-server-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_UNCONFIGURED = {
  ok: true,
  store: null,
  products: [],
  recommendedProductIds: [],
  popularProductIds: [],
  recommendedProducts: [],
  popularProducts: [],
  categories: [],
  meta: { source: "supabase_unconfigured" as const, canSell: false, menu_sold_out_bottom: false },
};

function responseStatusForMenusBody(body: StoreMenusCatalogBody & { error?: string }): number {
  if (body.ok === false) return 500;
  if (body.store === null) return 404;
  return 200;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const startedAt = performance.now();
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const cacheBypass = resolveRouteMemoryCacheBypass(new URL(req.url).searchParams);
  const storeMenusBypass =
    new URL(req.url).searchParams.get("storeMenusBypass") === "1" &&
    process.env.NODE_ENV === "development";
  const effectiveCacheBypass = cacheBypass.bypass || storeMenusBypass;
  const perfHeaders = (opts: {
    cache_hit: 0 | 1;
    db_execution_ms: number;
    query_count: number;
  }) =>
    storePublicApiPerfHeaders({
      startedAt,
      bypass: effectiveCacheBypass,
      bypass_reason: storeMenusBypass ? cacheBypass.reason ?? "fresh" : cacheBypass.reason,
      ...opts,
    });

  if (!effectiveCacheBypass) {
    const cached = readStoreMenusPublicServerCache(decoded);
    if (cached) {
      const bodyText = JSON.stringify(cached);
      logDeliveryMenusApiBreakdown(
        buildDeliveryMenusApiBreakdown({
          slug: decoded,
          startedAt,
          marks: { authDone: startedAt, storeDone: startedAt, payloadDone: performance.now() },
          payloadBuildMs: 0,
          responseSizeBytes: new TextEncoder().encode(bodyText).length,
          queryCount: 0,
          cacheHit: true,
        })
      );
      return NextResponse.json(cached, {
        status: responseStatusForMenusBody(cached as StoreMenusCatalogBody),
        headers: perfHeaders({ cache_hit: 1, db_execution_ms: 0, query_count: 0 }),
      });
    }
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(EMPTY_UNCONFIGURED);
  }

  try {
    let coldDbMs = 0;
    let coldQueryCount = 0;
    let menusSnapshotVia: "counter_row" | "unified_rpc" | undefined;

    const payload = await runStoreMenusPublicServerSingleFlight(decoded, async () => {
      if (!effectiveCacheBypass) {
        const memHit = readStoreMenusPublicServerCache(decoded);
        if (memHit) {
          return { body: memHit, status: responseStatusForMenusBody(memHit as StoreMenusCatalogBody) };
        }
      }

      const result = await fetchStoreMenusCatalog(sb, decoded, startedAt);
      coldDbMs = result.dbMs;
      coldQueryCount = result.queryCount;

      if (!result.ok) {
        return { body: result.body, status: result.status };
      }

      if (result.snapshotVia) menusSnapshotVia = result.snapshotVia;

      const payloadStart = performance.now();
      if (!effectiveCacheBypass) {
        writeStoreMenusPublicServerCache(decoded, result.body);
      }
      result.marks.payloadDone = performance.now();
      const bodyText = JSON.stringify(result.body);
      logDeliveryMenusApiBreakdown(
        buildDeliveryMenusApiBreakdown({
          slug: decoded,
          startedAt,
          marks: result.marks,
          payloadBuildMs: performance.now() - payloadStart,
          responseSizeBytes: new TextEncoder().encode(bodyText).length,
          queryCount: result.queryCount,
          cacheHit: false,
        })
      );

      return { body: result.body, status: 200 };
    });

    const snapshotHeaders: Record<string, string> = menusSnapshotVia
      ? {
          "x-samarket-store-menus-snapshot-path": "1",
          "x-samarket-store-menus-snapshot-via": menusSnapshotVia,
          "x-samarket-store-menus-query-wave-2-ms": "0",
          "x-samarket-store-menus-rpc-removed": "1",
        }
      : {};

    return NextResponse.json(payload.body, {
      status: payload.status,
      headers: {
        ...perfHeaders({
          cache_hit: 0,
          db_execution_ms: coldDbMs,
          query_count: coldQueryCount,
        }),
        ...snapshotHeaders,
      },
    });
  } catch (e) {
    console.error("[api/stores/slug/menus]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
