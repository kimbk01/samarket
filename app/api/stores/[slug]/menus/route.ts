import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  buildDeliveryMenusApiBreakdown,
  logDeliveryMenusApiBreakdown,
} from "@/lib/stores/delivery-menus-api-breakdown";
import { fetchStoreMenusCatalog, type StoreMenusCatalogBody } from "@/lib/stores/fetch-store-menus-catalog";
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
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const startedAt = performance.now();
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

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
    return NextResponse.json(cached, { status: responseStatusForMenusBody(cached as StoreMenusCatalogBody) });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(EMPTY_UNCONFIGURED);
  }

  try {
    const payload = await runStoreMenusPublicServerSingleFlight(decoded, async () => {
      const memHit = readStoreMenusPublicServerCache(decoded);
      if (memHit) return { body: memHit, status: responseStatusForMenusBody(memHit as StoreMenusCatalogBody) };

      const result = await fetchStoreMenusCatalog(sb, decoded, startedAt);
      if (!result.ok) {
        return { body: result.body, status: result.status };
      }

      const payloadStart = performance.now();
      writeStoreMenusPublicServerCache(decoded, result.body);
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

    return NextResponse.json(payload.body, { status: payload.status });
  } catch (e) {
    console.error("[api/stores/slug/menus]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
