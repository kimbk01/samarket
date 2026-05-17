/**
 * Owner dashboard API 3-round benchmark.
 * Usage (PowerShell):
 *   $env:OWNER_DASHBOARD_BASE="http://localhost:3000"
 *   $env:OWNER_DASHBOARD_STORE_ID="19085860-52d2-4183-b033-e71fcb58bcec"
 *   $env:OWNER_DASHBOARD_COOKIE="sb-...=...; ..."   # browser Application → Cookie
 *   node scripts/measure-owner-dashboard-api.mjs
 */
const base = (process.env.OWNER_DASHBOARD_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const storeId = (process.env.OWNER_DASHBOARD_STORE_ID ?? "").trim();
const cookie = (process.env.OWNER_DASHBOARD_COOKIE ?? "").trim();
const rounds = Math.max(1, Math.min(10, Number(process.env.OWNER_DASHBOARD_ROUNDS) || 3));

if (!storeId || !cookie) {
  console.error("Set OWNER_DASHBOARD_STORE_ID and OWNER_DASHBOARD_COOKIE");
  process.exit(1);
}

const paths = [
  { key: "order-counts", url: `/api/me/stores/${encodeURIComponent(storeId)}/order-counts` },
  { key: "orders", url: `/api/me/stores/${encodeURIComponent(storeId)}/orders` },
  { key: "inquiries", url: `/api/me/stores/${encodeURIComponent(storeId)}/inquiries` },
  {
    key: "notifications-owner-unread",
    url: "/api/me/notifications?unread_count_only=1&owner_store_commerce_unread_only=1",
  },
];

async function hit(path) {
  const t0 = performance.now();
  const res = await fetch(`${base}${path.url}`, {
    headers: { cookie, accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  const wall_ms = Math.round(performance.now() - t0);
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* noop */
  }
  return { status: res.status, wall_ms, bytes: Buffer.byteLength(text, "utf8"), json };
}

function summarize(rows) {
  const nums = (k) => rows.map((r) => r[k]).filter((n) => typeof n === "number");
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return { min: nums("wall_ms").length ? Math.min(...nums("wall_ms")) : null, avg: avg(nums("wall_ms")), max: nums("wall_ms").length ? Math.max(...nums("wall_ms")) : null };
}

async function main() {
  console.log({ base, storeId, rounds });
  for (const path of paths) {
    const rows = [];
    for (let i = 0; i < rounds; i++) {
      const r = await hit(path);
      rows.push({ round: i + 1, status: r.status, wall_ms: r.wall_ms, payload_bytes: r.bytes });
      if (i < rounds - 1) await new Promise((res) => setTimeout(res, 120));
    }
    console.log(path.key, summarize(rows), rows);
  }
  console.log("Check dev server console for [owner-dashboard-perf] auth_ms, db_ms, cache_hit, ...");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
