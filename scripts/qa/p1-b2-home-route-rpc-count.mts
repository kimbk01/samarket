/**
 * Invoke home-feed GET handler once; count PostgREST batch RPC via global fetch hook.
 * Usage: npx tsx scripts/qa/p1-b2-home-route-rpc-count.mts
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

let batchRpcCount = 0;
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL ? input.href
    : input.url;
  if (url.includes("get_store_popular_product_stats_batch")) batchRpcCount += 1;
  return origFetch(input, init);
};

const start = Date.now();
const { GET } = await import("../../app/api/stores/home-feed/route");
const res = await GET(new Request("http://127.0.0.1:3000/api/stores/home-feed"));
const body = await res.json();
const elapsed = Date.now() - start;

console.log(
  JSON.stringify({
    proof: "home-feed GET handler in-process (same route module as HTTP)",
    handlerStatus: res.status,
    batchRpcCount,
    handlerTotalMs: elapsed,
    storeCount: Array.isArray(body.stores) ? body.stores.length : 0,
    popularProductStatsStatus: body.meta?.popularProductStats?.status ?? null,
    responseBytes: JSON.stringify(body).length,
  })
);
