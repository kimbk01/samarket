#!/usr/bin/env node
/**
 * 브라우저 콘솔에서 `copy(JSON.stringify(window.__dibayBootVerify))` 후
 *   node scripts/dibay-boot-verify-report.mjs < paste.json
 * 또는 dev 터미널 [route-perf] 로그 파일과 함께 사용.
 */
import { readFileSync } from "node:fs";

function readInput() {
  try {
    const path = process.argv[2];
    if (path) return readFileSync(path, "utf8");
  } catch {
    /* stdin */
  }
  return readFileSync(0, "utf8");
}

function parseRoutePerfLogs(text) {
  const rows = [];
  const re = /\[route-perf\]\s*(\{[\s\S]*?\})\s*(?=\n\[|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      rows.push(JSON.parse(m[1]));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function summarizeClientJournal(j) {
  const entries = j?.entries ?? [];
  const fp = j?.firstPaintAtMs ?? null;
  const count = (pred) => entries.filter((e) => pred(e.url)).length;
  const beforeFp = (pred) =>
    fp == null ? null : entries.filter((e) => pred(e.url) && e.atMs < fp).length;

  return [
    {
      route: "/api/me/profile?lite=1",
      calls: count((u) => u.includes("lite=1") || u.includes("mode=minimal")),
      before_fp: beforeFp((u) => u.includes("lite=1") || u.includes("mode=minimal")),
    },
    {
      route: "/api/me/profile (full)",
      calls: count(
        (u) =>
          u.includes("/api/me/profile") &&
          !u.includes("lite=1") &&
          !u.includes("mode=minimal")
      ),
      before_fp: beforeFp(
        (u) =>
          u.includes("/api/me/profile") &&
          !u.includes("lite=1") &&
          !u.includes("mode=minimal")
      ),
    },
    {
      route: "/api/auth/session",
      calls: count((u) => u.includes("/api/auth/session")),
      before_fp: beforeFp((u) => u.includes("/api/auth/session")),
    },
    {
      route: "/api/me/store-owner-hub-badge",
      calls: count((u) => u.includes("store-owner-hub-badge")),
      before_fp: beforeFp((u) => u.includes("store-owner-hub-badge")),
    },
    {
      route: "/api/community-messenger/bootstrap",
      calls: count((u) => u.includes("community-messenger/bootstrap")),
      before_fp: beforeFp((u) => u.includes("community-messenger/bootstrap")),
    },
  ];
}

function summarizeRoutePerf(rows) {
  const byRoute = new Map();
  for (const r of rows) {
    const key = r.route ?? "?";
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key).push(r);
  }
  const out = [];
  for (const [route, list] of byRoute) {
    const last = list[list.length - 1];
    out.push({
      route,
      호출_횟수: list.length,
      total_ms: last.total_ms,
      db_ms: last.db_ms,
      cache_hit: last.cache_hit,
      deferred: last.deferred,
      first_paint_blocking: last.first_paint_blocking,
      trade_enrich_ms: last.enrich_trade_ms ?? last.trade_enrich_ms,
      lite_trade_enrich_skipped: last.lite_trade_enrich_skipped,
      client_call_source: last.client_call_source,
    });
  }
  return out;
}

const raw = readInput().trim();
if (!raw) {
  console.error("Usage: node scripts/dibay-boot-verify-report.mjs [journal.json|route-perf.log]");
  process.exit(1);
}

let journal = null;
try {
  journal = JSON.parse(raw);
} catch {
  const perf = parseRoutePerfLogs(raw);
  console.log("\n=== route-perf 요약 ===\n");
  console.table(summarizeRoutePerf(perf));
  process.exit(0);
}

console.log("\n=== 클라이언트 fetch journal ===\n");
console.table(summarizeClientJournal(journal));
console.log("\nraw entries:", journal.entries?.length ?? 0, "firstPaintAtMs:", journal.firstPaintAtMs);
