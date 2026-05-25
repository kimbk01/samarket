/**
 * Store menus route memory SWR — 6-scenario live measure (server logs).
 * Usage: node scripts/measure-store-menus-swr.mjs
 */
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const terminalsDir = process.env.SAMARKET_TERMINALS_DIR || path.join(process.cwd(), "..", ".cursor", "projects", "c-samarket", "terminals");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findStoreSlug() {
  const env = process.env.DIBAY_PERF_STORE_SLUG?.trim();
  if (env) return env;
  for (const url of [`${baseUrl}/api/stores/browse?limit=1`, `${baseUrl}/api/stores/home-feed?limit=1`]) {
    const res = await fetch(url, { headers: { "cache-control": "no-store" } });
    const j = await res.json().catch(() => null);
    const slug = j?.stores?.[0]?.slug ?? j?.items?.[0]?.slug ?? null;
    if (slug) return slug;
  }
  throw new Error("no store slug found");
}

async function timedMenusFetch(slug, query = "") {
  const url = `${baseUrl}/api/stores/${encodeURIComponent(slug)}/menus${query}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "cache-control": "no-store" } });
  await res.text();
  return {
    client_ms: Date.now() - t0,
    status: res.status,
    cache_hit: res.headers.get("x-samarket-cache-hit") ?? res.headers.get("x-cache-hit") ?? "",
    snapshot_via: res.headers.get("x-samarket-snapshot-via") ?? "",
    db_ms: res.headers.get("x-samarket-db-execution-ms") ?? "",
  };
}

function readLatestServerLogTail() {
  const dirs = [terminalsDir, path.join(process.cwd(), ".cursor", "projects", "c-samarket", "terminals")];
  let best = "";
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".txt")) continue;
      const p = path.join(dir, f);
      try {
        const stat = fs.statSync(p);
        if (stat.size < 50) continue;
        const text = fs.readFileSync(p, "utf8");
        if (text.includes("[snapshot-swr-analysis]") || text.includes("[menus-cold-fill-deep-breakdown]")) {
          if (text.length > best.length) best = text;
        }
      } catch {
        /* skip */
      }
    }
  }
  return best;
}

function extractLogs(text, tag, afterIndex = 0) {
  const out = [];
  let idx = afterIndex;
  while (true) {
    const pos = text.indexOf(`[${tag}]`, idx);
    if (pos === -1) break;
    const brace = text.indexOf("{", pos);
    if (brace === -1) break;
    let depth = 0;
    let end = brace;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    try {
      out.push(JSON.parse(text.slice(brace, end)));
    } catch {
      /* skip malformed */
    }
    idx = end;
  }
  return out;
}

async function main() {
  const slug = process.env.DIBAY_PERF_STORE_SLUG?.trim() || (await findStoreSlug());
  console.log("=== store menus SWR measure ===");
  console.log("base:", baseUrl);
  console.log("slug:", slug);

  const logBefore = readLatestServerLogTail();
  const logBeforeLen = logBefore.length;
  const results = [];

  // Seed route memory (bypass skips write — use normal fetch first).
  const seed = await timedMenusFetch(slug);
  results.push({ scenario: "0_seed_memory", ...seed });
  await sleep(150);

  const warm = await timedMenusFetch(slug);
  results.push({ scenario: "2_warm_reopen", ...warm });
  await sleep(150);

  console.log("waiting 20s for soft stale window...");
  await sleep(20_000);
  const reopen20 = await timedMenusFetch(slug);
  results.push({ scenario: "3_reopen_20s", ...reopen20 });
  await sleep(150);

  console.log("waiting 25s more (45s total from seed)...");
  await sleep(25_000);
  const reopen45 = await timedMenusFetch(slug);
  results.push({ scenario: "4_reopen_45s", ...reopen45 });
  await sleep(150);

  console.log("waiting 20s more (65s total from seed — hard stale)...");
  await sleep(20_000);
  const reopen65 = await timedMenusFetch(slug);
  results.push({ scenario: "5_reopen_65s_hard_stale", ...reopen65 });
  await sleep(150);

  const [tabA, tabB] = await Promise.all([timedMenusFetch(slug), timedMenusFetch(slug)]);
  results.push({
    scenario: "6_multi_tab_reopen",
    client_ms: Math.max(tabA.client_ms, tabB.client_ms),
    status: tabA.status,
    cache_hit: `${tabA.cache_hit}/${tabB.cache_hit}`,
    snapshot_via: tabA.snapshot_via,
    db_ms: tabA.db_ms,
  });

  await sleep(500);
  const logAfter = readLatestServerLogTail();
  const newLog = logAfter.slice(logBeforeLen);
  const swrLogs = extractLogs(newLog, "snapshot-swr-analysis");
  const coldLogs = extractLogs(newLog, "menus-cold-fill-deep-breakdown");

  console.log("\n--- HTTP results ---");
  console.table(results);

  console.log("\n--- [snapshot-swr-analysis] (new) ---");
  for (const row of swrLogs.slice(-12)) {
    console.log(JSON.stringify(row));
  }

  console.log("\n--- [menus-cold-fill-deep-breakdown] route_total_ms (new) ---");
  for (const row of coldLogs.slice(-8)) {
    console.log(
      JSON.stringify({
        slug: row.slug,
        route_total_ms: row.route_total_ms,
        snapshot_via: row.snapshot_via,
        memory_cache_lookup_ms: row.memory_cache_lookup_ms,
        snapshot_row_lookup_ms: row.snapshot_row_lookup_ms,
        cache_hit: row.cache_hit,
        worst_stage: row.worst_stage,
      })
    );
  }

  const softStale = swrLogs.filter((r) => r.memory_soft_stale_hit === true);
  const hardStale = swrLogs.filter((r) => r.memory_hard_stale === true);
  const bgFinished = swrLogs.filter((r) => r.background_refresh_finished === true);
  const hardStaleCold = coldLogs.filter(
    (r) => r.snapshot_row_lookup_ms > 0 && r.cache_hit === 0
  );
  console.log("\n--- summary ---");
  console.log("soft_stale_serves:", softStale.length);
  console.log("hard_stale_events:", hardStale.length);
  console.log("hard_stale_db_fallbacks:", hardStaleCold.length);
  console.log("background_refresh_finished:", bgFinished.length);
  if (bgFinished.length) {
    console.log(
      "background_refresh_ms:",
      bgFinished.map((r) => r.background_refresh_ms).join(", ")
    );
  }
  const hardPass =
    hardStale.some((r) => r.snapshot_lookup_skipped === false) &&
    hardStaleCold.some((r) => r.snapshot_row_lookup_ms > 0);
  console.log("hard_stale_pass:", hardPass ? "PASS" : "FAIL");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
