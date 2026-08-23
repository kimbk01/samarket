/**
 * Invoke browse GET handler once; count enrichment RPC/catalog via global fetch hook.
 * Usage: npx tsx scripts/qa/p1-b3-browse-route-rpc-count.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

type RpcBody = { p_store_ids?: string[] };

let popularProductBatchRpcCount = 0;
let completedOrderCountsRpcCount = 0;
let catalogQueryCount = 0;
let commerceSettingsQueryCount = 0;
const popularBatchStoreIds: string[][] = [];

const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL ? input.href
    : input.url;

  if (url.includes("get_store_popular_product_stats_batch")) {
    popularProductBatchRpcCount += 1;
    try {
      const body = init?.body ? JSON.parse(String(init.body)) as RpcBody : {};
      if (Array.isArray(body.p_store_ids)) popularBatchStoreIds.push(body.p_store_ids);
    } catch {
      /* ignore */
    }
  }
  if (url.includes("get_store_completed_order_counts")) completedOrderCountsRpcCount += 1;
  if (url.includes("/store_products") && url.includes("store_id")) catalogQueryCount += 1;
  if (url.includes("commerce_settings") || url.includes("store_commerce_settings")) {
    commerceSettingsQueryCount += 1;
  }

  return origFetch(input, init);
};

const sort = process.env.P1_B3_BROWSE_SORT ?? "default";
const page = process.env.P1_B3_BROWSE_PAGE ?? "1";
const limit = process.env.P1_B3_BROWSE_LIMIT ?? "60";
const browseUrl = `http://127.0.0.1:3000/api/stores/browse?primary=restaurant&sub=all&page=${page}&limit=${limit}&sort=${sort}&storesBrowseBypass=1`;

const start = Date.now();
const { GET } = await import("../../app/api/stores/browse/route");
const res = await GET(new Request(browseUrl));
const body = await res.json();
const elapsed = Date.now() - start;

const stores = Array.isArray(body.stores) ? body.stores : [];
const pageStoreIds = stores.map((s: { id: string }) => String(s.id));

const result = {
    proof: "browse GET handler in-process (same route module as HTTP)",
    browseUrl,
    handlerStatus: res.status,
    popularProductBatchRpcCount,
    completedOrderCountsRpcCount,
    catalogQueryCount,
    commerceSettingsQueryCount,
    popularBatchStoreIds,
    pageStoreIds,
    pageScopedPopularBatch:
      popularBatchStoreIds.length === 0
        ? true
        : popularBatchStoreIds.every((ids) => ids.every((id) => pageStoreIds.includes(id))),
    handlerTotalMs: elapsed,
    storeCount: stores.length,
    platformPopularCount: stores.filter((s: { platformPopularProduct?: unknown }) => s.platformPopularProduct).length,
    responseBytes: JSON.stringify(body).length,
    meta: body.meta ?? null,
    perfHeaders: {
      query_count: res.headers.get("x-samarket-query-count"),
      db_execution_ms: res.headers.get("x-samarket-db-execution-ms"),
    },
};

process.stdout.write(`${JSON.stringify(result)}\n`);
