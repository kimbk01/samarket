import { NextResponse } from "next/server";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { shouldBypassRouteMemoryCache } from "@/lib/http/route-cache-bypass";
import { logBrowseFeaturedItemsPerf } from "@/lib/stores/browse-featured-items-perf-log";
import {
  BROWSE_FEATURED_ITEMS_BATCH_STORE_CAP,
} from "@/lib/stores/browse-featured-items-types";
import { loadBrowseFeaturedItemsBatch } from "@/lib/stores/load-browse-featured-items-batch";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_BROWSE_HTTP_CACHE_CONTROL = "private, no-store";

function parseStoreIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of parts) {
    if (id.length < 8 || id.length > 64) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= BROWSE_FEATURED_ITEMS_BATCH_STORE_CAP) break;
  }
  return out;
}

/**
 * GET /api/stores/browse-featured-items?storeIds=id1,id2,…
 * browse 목록 메뉴 미리보기 — 메인 `/api/stores/browse` 와 분리(deferred hydrate).
 */
export async function GET(req: Request) {
  const t0 = devPerfNow();
  const { searchParams } = new URL(req.url);
  const bypass = shouldBypassRouteMemoryCache(searchParams);
  const storeIds = parseStoreIds(searchParams.get("storeIds"));

  if (storeIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "store_ids_required", items: {} },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    const body = { ok: true as const, items: {} as Record<string, { featuredItems: [] }> };
    return NextResponse.json(body, { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } });
  }

  try {
    const result = await loadBrowseFeaturedItemsBatch(supabase, storeIds, { bypassCache: bypass });
    const body = { ok: true as const, items: result.byStoreId };
    const payloadBytes = JSON.stringify(body).length;
    const totalMs = Math.round(devPerfNow() - t0);
    const stages = {
      db: result.dbMs,
      transform: result.transformMs,
    };
    let worst_stage = "none";
    let worst_stage_ms = 0;
    for (const [name, ms] of Object.entries(stages)) {
      const rounded = Math.round(ms);
      if (rounded > worst_stage_ms) {
        worst_stage = name;
        worst_stage_ms = rounded;
      }
    }

    logBrowseFeaturedItemsPerf({
      request_count: 1,
      store_count: storeIds.length,
      db_ms: Math.round(result.dbMs),
      transform_ms: Math.round(result.transformMs),
      cache_hit: result.cacheHit ? 1 : 0,
      payload_bytes: payloadBytes,
      query_count: result.queryCount,
      worst_stage,
      worst_stage_ms,
    });

    void totalMs;
    return NextResponse.json(body, { headers: { "Cache-Control": STORE_BROWSE_HTTP_CACHE_CONTROL } });
  } catch (e) {
    console.error("[api/stores/browse-featured-items]", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
        items: {},
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
