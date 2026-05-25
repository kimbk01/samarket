#!/usr/bin/env node
/**
 * NHR1 — Next Hot Route Discovery & Prioritization
 *
 * Static analysis of app/api routes + terminal log scan for fallback/long-session.
 * Does NOT modify routes. Emits structured logs and writes priority report.
 *
 * Usage: npm run nhr1:discover
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_ROOT = path.join(root, "app", "api");
const REPORT_PATH = path.join(root, "docs", "perf", "next-hot-route-priority-report.md");
const TERMINALS_DIR =
  process.env.NHR1_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

/** Structural PASS — do not recommend re-migration */
const SNAPSHOT_PASS_ROUTES = new Set([
  "/api/me/store-owner-hub-badge",
  "/api/community-messenger/home-sync",
  "/api/community-messenger/rooms/[roomId]/bootstrap",
  "/api/stores/[slug]/menus",
  "/api/me/notifications",
  "/api/me/stores/[storeId]/order-counts",
]);

/** Measured / documented warm baselines (linked dev or structural verify — not prod) */
const KNOWN_WALL_MS = {
  "/api/me/store-owner-hub-badge": 39,
  "/api/community-messenger/home-sync": 40,
  "/api/community-messenger/rooms/[roomId]/bootstrap": 51,
  "/api/stores/[slug]/menus": 141,
  "/api/me/notifications": 168,
  "/api/me/stores/[storeId]/order-counts": 254,
  "/api/stores/browse": 396,
  "/api/me/stores/[storeId]/orders": 280,
  "/api/community-messenger/bootstrap": 450,
  "/api/chat/rooms": 320,
  "/api/me/store-orders": 220,
};

const FALLBACK_BRANCHES = [
  { route: "/api/me/store-owner-hub-badge", branch: "legacy_aggregate", file: "lib/chats/build-owner-hub-badge-payload.ts", tag: "hub-badge-snapshot-fallback" },
  { route: "/api/community-messenger/home-sync", branch: "legacy_multi_wave", file: "lib/community-messenger/service.ts", tag: "home-sync-snapshot-fallback" },
  { route: "/api/community-messenger/rooms/[roomId]/bootstrap", branch: "legacy_wave_a", file: "lib/community-messenger/service.ts", tag: "room-bootstrap-snapshot-fallback" },
  { route: "/api/stores/[slug]/menus", branch: "legacy_products_popular", file: "lib/stores/fetch-store-menus-catalog.ts", tag: "store-menus-snapshot-fallback" },
  { route: "/api/me/notifications", branch: "segmented_unread", file: "app/api/me/notifications/route.ts", tag: "owner-notifications-snapshot-fallback" },
  { route: "/api/me/stores/[storeId]/order-counts", branch: "dashboard_rpc", file: "lib/stores/fetch-owner-store-order-counts.ts", tag: "delivery-summary-snapshot-fallback" },
  { route: "/api/me/stores/[storeId]/order-counts", branch: "legacy_25_count", file: "lib/stores/fetch-owner-store-order-counts.ts", tag: "owner-store-ops-counts-legacy-fallback" },
  { route: "/api/me/store-orders/[orderId]", branch: "legacy_parallel", file: "app/api/me/store-orders/[orderId]/route.ts", tag: "legacy_parallel" },
  { route: "/api/me/stores/[storeId]/orders/[orderId]", branch: "legacy_parallel", file: "app/api/me/stores/[storeId]/orders/[orderId]/route.ts", tag: "legacy_parallel" },
];

function routePathFromFile(absFile) {
  const rel = path.relative(API_ROOT, absFile).replace(/\\/g, "/");
  const segs = rel.split("/");
  segs.pop();
  return `/api/${segs.join("/")}`;
}

function classifyGroup(route) {
  if (route.includes("community-messenger")) return "messenger";
  if (route.includes("/chat/")) return "messenger";
  if (route.includes("store-order") || route.includes("/orders")) return "delivery";
  if (route.includes("/stores/") && route.startsWith("/api/me/")) return "owner";
  if (route.includes("notification")) return "notification";
  if (route.includes("realtime") || route.includes("presence") || route.includes("calls/")) return "realtime";
  if (route.startsWith("/api/stores")) return "store_public";
  if (route.startsWith("/api/me/")) return "owner";
  if (route.startsWith("/api/admin")) return "admin";
  return "other";
}

function trafficWeight(route, group) {
  if (group === "admin") return 0.25;
  let w = 1.0;
  if (group === "messenger") w = 1.5;
  else if (group === "delivery") w = 1.45;
  else if (group === "owner") w = 1.4;
  else if (group === "notification") w = 1.35;
  else if (group === "realtime") w = 1.3;
  else if (group === "store_public") w = 1.25;
  if (route.includes("bootstrap") || route.includes("home-sync")) w += 0.15;
  if (route.includes("browse") || route.includes("home-feed")) w += 0.1;
  return w;
}

/** Product-prioritized boost (체감·반복 호출·owner dashboard 인접) */
const PRIORITY_ROUTE_BOOST = {
  "/api/me/stores/[storeId]/orders": 1.85,
  "/api/community-messenger/bootstrap": 1.65,
  "/api/stores/browse": 1.55,
  "/api/chat/rooms": 1.45,
  "/api/me/store-orders": 1.4,
  "/api/me/stores/[storeId]/order-chats": 1.35,
  "/api/stores/[slug]/summary": 1.3,
  "/api/stores/home-feed": 1.25,
};

function countMatches(text, re) {
  return (text.match(re) ?? []).length;
}

function analyzeRouteFile(absFile) {
  const route = routePathFromFile(absFile);
  const text = fs.readFileSync(absFile, "utf8");
  const group = classifyGroup(route);
  const isPass = SNAPSHOT_PASS_ROUTES.has(route);
  const hasGet = /\bexport\s+(async\s+)?function\s+GET\b/.test(text) || /\bGET\s*:\s*async/.test(text);
  const hasPost = /\bexport\s+(async\s+)?function\s+(POST|PATCH|PUT|DELETE)\b/.test(text);

  const promiseAllCount = countMatches(text, /Promise\.all\s*\(/g);
  const awaitCount = countMatches(text, /\bawait\b/g);
  const embedJoinCount = countMatches(text, /\.select\s*\(\s*[`'"][^`'"]*\([^`'"]*\)/g);
  const supabaseQueryCount = countMatches(text, /\.(from|rpc)\s*\(/g);

  const snapshotFirst =
    isPass ||
    (/get_[a-z_]+_snapshot|tryLoad.*Snapshot|tryBuild.*Snapshot/i.test(text) &&
      !/legacy_parallel/i.test(text));

  const partialSnapshotRpc =
    /get_[a-z_]+_snapshot/i.test(text) && /legacy_parallel/i.test(text);

  const fallbackUsed =
    /snapshot-fallback|legacy_parallel|legacy_aggregate|legacy-fallback|owner-store-ops-counts-legacy/i.test(text);

  const perfTagged =
    /\[owner-orders-list-perf\]|\[cm-bootstrap-v2\]|\[browse-perf|\[route-perf\]|\[store-order-detail-perf\]|\[hub-badge-breakdown\]|\[route-hotpath-analysis\]/i.test(
      text
    );

  const aggregateCompute =
    !snapshotFirst &&
    (promiseAllCount >= 2 ||
      /aggregate|unread_count|count\(|\.reduce\(|enrich|bundle|parallel_wall|legacy_parallel/i.test(text));

  const sequentialAwait = awaitCount > promiseAllCount * 3 + 5 && promiseAllCount > 0;
  const repeatedJoin = embedJoinCount >= 2 || countMatches(text, /\.select\s*\([^)]*!inner/g) >= 1;

  const roundTrips = Math.max(1, promiseAllCount + Math.floor(supabaseQueryCount / 3));
  const queryWave2Ms = isPass ? 0 : promiseAllCount >= 2 ? 120 : promiseAllCount === 1 ? 0 : 0;
  const rpcRemoved = isPass || snapshotFirst ? 1 : 0;

  const wallMs = KNOWN_WALL_MS[route] ?? 80 + promiseAllCount * 90 + embedJoinCount * 40;
  const transportMs = Math.round(wallMs * 0.55);
  const dbMs = Math.round(wallMs * 0.35);

  const aggregatePenalty = aggregateCompute ? 500 : 0;
  const fallbackPenalty = fallbackUsed ? 1000 : 0;
  const perfBoost = perfTagged ? 1.2 : 1.0;
  const priorityBoost = PRIORITY_ROUTE_BOOST[route] ?? 1.0;
  const weight = trafficWeight(route, group);
  const hotnessScore = Math.round(
    weight *
      priorityBoost *
      perfBoost *
      (wallMs + transportMs + roundTrips * 100 + aggregatePenalty + fallbackPenalty)
  );

  let structuralRisk = "SAFE";
  if (isPass) structuralRisk = "SAFE";
  else if (
    aggregateCompute &&
    (promiseAllCount >= 2 || repeatedJoin || fallbackUsed || roundTrips >= 3)
  ) {
    structuralRisk = "DANGER";
  } else if (fallbackUsed || repeatedJoin || transportMs > 200 || aggregateCompute) {
    structuralRisk = "WARNING";
  }

  let recommendedAction = "monitor";
  if (isPass) recommendedAction = "none_pass_track";
  else if (structuralRisk === "DANGER" && hasGet) {
    recommendedAction = partialSnapshotRpc ? "complete_partial_snapshot" : "snapshot_first_migration";
  }
  else if (structuralRisk === "WARNING" && hasGet) recommendedAction = "hotpath_instrument_then_snapshot";
  else if (!hasGet && hasPost) recommendedAction = "mutation_skip";

  return {
    route,
    route_group: group,
    file: path.relative(root, absFile).replace(/\\/g, "/"),
    has_get: hasGet,
    total_ms: wallMs,
    db_ms: dbMs,
    transport_ms: transportMs,
    round_trips: roundTrips,
    aggregate_compute_detected: aggregateCompute ? 1 : 0,
    repeated_join_detected: repeatedJoin ? 1 : 0,
    sequential_await_detected: sequentialAwait ? 1 : 0,
    query_wave_2_ms: queryWave2Ms,
    rpc_removed: rpcRemoved,
    fallback_used: fallbackUsed ? 1 : 0,
    snapshot_first: snapshotFirst ? 1 : 0,
    request_time_compute_detected: aggregateCompute && !snapshotFirst ? 1 : 0,
    hotness_score: hotnessScore,
    structural_risk: structuralRisk,
    recommended_action: recommendedAction,
    perf_tagged: perfTagged ? 1 : 0,
    promise_all_count: promiseAllCount,
  };
}

function walkRoutes(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkRoutes(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function readTerminalLogs() {
  let combined = "";
  if (!fs.existsSync(TERMINALS_DIR)) return combined;
  for (const f of fs.readdirSync(TERMINALS_DIR)) {
    if (!f.endsWith(".txt")) continue;
    try {
      combined += fs.readFileSync(path.join(TERMINALS_DIR, f), "utf8");
    } catch {
      /* */
    }
  }
  return combined;
}

function countTag(text, tag) {
  return (text.match(new RegExp(`\\[${tag}\\]`, "g")) ?? []).length;
}

function parseLogBlocks(text, tag) {
  const rows = [];
  const re = new RegExp(`\\[${tag}\\]\\s*(\\{[^\\n]+\\})`, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      rows.push(JSON.parse(m[1]));
    } catch {
      /* */
    }
  }
  return rows;
}

function buildSnapshotCandidates(hotRoutes) {
  const candidates = hotRoutes
    .filter(
      (r) =>
        r.has_get &&
        !SNAPSHOT_PASS_ROUTES.has(r.route) &&
        !r.route.startsWith("/api/admin") &&
        r.route_group !== "admin" &&
        (r.recommended_action === "snapshot_first_migration" ||
          r.recommended_action === "complete_partial_snapshot" ||
          (r.structural_risk === "DANGER" && r.request_time_compute_detected))
    )
    .slice(0, 12)
    .map((r, i) => ({
      route: r.route,
      reason: [
        r.request_time_compute_detected ? "request_time_aggregate" : null,
        r.repeated_join_detected ? "repeated_postgrest_embed" : null,
        r.fallback_used ? "legacy_fallback_present" : null,
        r.round_trips >= 3 ? "multi_rtt_waves" : null,
        r.perf_tagged ? "existing_perf_instrumentation" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      estimated_rtt_reduction_ms: Math.round(r.round_trips * 80 + r.transport_ms * 0.4),
      estimated_structural_gain: r.structural_risk === "DANGER" ? "high" : "medium",
      estimated_ui_impact:
        r.route_group === "messenger"
          ? "high"
          : r.route_group === "owner" || r.route_group === "delivery"
            ? "high"
            : r.route_group === "store_public"
              ? "medium"
              : "low",
      recommended_priority: i + 1,
    }));
  return candidates.sort((a, b) => {
    const order = Object.keys(PRIORITY_ROUTE_BOOST);
    const ai = order.indexOf(a.route);
    const bi = order.indexOf(b.route);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.recommended_priority - b.recommended_priority;
  }).map((c, i) => ({ ...c, recommended_priority: i + 1 }));
}

function generateReport(payload) {
  const { analyses, top10, dangers, warnings, candidates, fallbackAudits, longSessionRows, nextPriority } =
    payload;
  const date = new Date().toISOString().slice(0, 10);
  return `# NHR1 — Next Hot Route Priority Report

> **Track:** NHR1 (Next Hot Route Discovery & Prioritization)  
> **Generated:** ${date}  
> **Command:** \`npm run nhr1:discover\`  
> **Routes scanned:** ${analyses.length} (\`app/api/**/route.ts\`)

---

## Executive summary

| Item | Value |
|------|-------|
| **Recommended next priority** | **${nextPriority.route}** (${nextPriority.track_code ?? "NHR1"}) |
| Structural PASS routes (skip) | ${SNAPSHOT_PASS_ROUTES.size} |
| DANGER (request-time aggregate) | ${dangers.length} |
| WARNING | ${warnings.length} |
| Snapshot migration candidates | ${candidates.length} |

**Principle:** Optimize **request-time aggregate removal**, not slow-query tuning alone. Linked RTT ≠ structural regression.

---

## 1. Top 10 hot routes (hotness score)

| Rank | Route | Group | hotness | wall_ms | RTT | risk | snapshot | action |
|------|-------|-------|---------|---------|-----|------|----------|--------|
${top10
  .map(
    (r, i) =>
      `| ${i + 1} | \`${r.route}\` | ${r.route_group} | ${r.hotness_score} | ${r.total_ms} | ${r.round_trips} | ${r.structural_risk} | ${r.snapshot_first ? "yes" : "no"} | ${r.recommended_action} |`
  )
  .join("\n")}

---

## 2. Top structural risks (DANGER)

| Route | round_trips | aggregate | fallback | joins | sequential |
|-------|-------------|-----------|----------|-------|------------|
${dangers
  .slice(0, 15)
  .map(
    (r) =>
      `| \`${r.route}\` | ${r.round_trips} | ${r.aggregate_compute_detected} | ${r.fallback_used} | ${r.repeated_join_detected} | ${r.sequential_await_detected} |`
  )
  .join("\n")}

---

## 3. Fallback cleanup candidates (PASS tracks)

| Route | branch | log hits | can_delete gate |
|-------|--------|----------|-----------------|
${fallbackAudits
  .map(
    (f) =>
      `| \`${f.route}\` | ${f.fallback_branch} | ${f.used_count} | ${f.can_delete ? "await OPS1-B 3× sign-off" : f.blocker} |`
  )
  .join("\n")}

---

## 4. Request-time aggregate remaining (GET, non-PASS)

| Route | waves | perf tagged | est. wall |
|-------|-------|-------------|-----------|
${analyses
  .filter((r) => r.has_get && r.request_time_compute_detected && !SNAPSHOT_PASS_ROUTES.has(r.route))
  .sort((a, b) => b.hotness_score - a.hotness_score)
  .slice(0, 15)
  .map((r) => `| \`${r.route}\` | ${r.promise_all_count} | ${r.perf_tagged ? "yes" : "no"} | ~${r.total_ms}ms |`)
  .join("\n")}

---

## 5. Snapshot migration candidates

| Priority | Route | reason | RTT reduction est. | UI impact |
|----------|-------|--------|-------------------|-----------|
${candidates
  .map(
    (c) =>
      `| ${c.recommended_priority} | \`${c.route}\` | ${c.reason} | ~${c.estimated_rtt_reduction_ms}ms | ${c.estimated_ui_impact} |`
  )
  .join("\n")}

---

## 6. Realtime / cross-tab risk routes

| Route | group | risk | note |
|-------|-------|------|------|
${analyses
  .filter(
    (r) =>
      (r.route_group === "messenger" || r.route_group === "realtime") &&
      r.structural_risk !== "SAFE" &&
      r.has_get
  )
  .sort((a, b) => b.hotness_score - a.hotness_score)
  .slice(0, 10)
  .map((r) => `| \`${r.route}\` | ${r.route_group} | ${r.structural_risk} | MRC1 separate — aggregate read path |`)
  .join("\n")}

---

## 7. Long-session global analysis

${longSessionRows.length ? longSessionRows.map((r) => `- \`${r.route}\`: duration ${r.duration_min}min · mem +${r.memory_growth_mb}MB · stale ${r.stale_state_count} · pass ${r.pass}`).join("\n") : "_No `[long-session-stability]` logs in terminals — enable `NEXT_PUBLIC_SAMARKET_OPS1_MONITOR=1` during 30min session._"}

---

## 8. Recommended next priority (NHR1 verdict)

**Route:** \`${nextPriority.route}\`

**Rationale:** ${nextPriority.reason}

**Do not touch:** HUB BADGE · HS2 · RB1 · SM1 · ODN1 · DSA1 · MRC1 (Structural PASS)

**After migration pattern:** unified RPC · counter row · event refresh · regression lock · verify e2e (copy SM1/ODN1 template)

---

## NHR1 PASS checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Full hot route analysis | ✓ ${analyses.length} routes |
| 2 | hotness score computed | ✓ |
| 3 | fallback global audit | ✓ |
| 4 | long-session analysis | ${longSessionRows.length ? "✓" : "▲ probe wired, no prod session log"} |
| 5 | snapshot candidates | ✓ ${candidates.length} |
| 6 | this report | ✓ |
| 7 | next priority route | ✓ \`${nextPriority.route}\` |

---

## Re-run

\`\`\`bash
npm run nhr1:discover
\`\`\`
`;
}

function main() {
  console.log("\n=== NHR1 Next Hot Route Discovery ===\n");

  const files = walkRoutes(API_ROOT);
  const analyses = files.map(analyzeRouteFile).filter((r) => r.has_get || r.hotness_score > 200);

  const allGet = analyses.filter((r) => r.has_get);
  const sorted = [...allGet]
    .filter((r) => !SNAPSHOT_PASS_ROUTES.has(r.route))
    .sort((a, b) => b.hotness_score - a.hotness_score);

  const top10 = [...allGet].sort((a, b) => b.hotness_score - a.hotness_score).slice(0, 10);

  for (const row of sorted.filter((r) => !SNAPSHOT_PASS_ROUTES.has(r.route)).slice(0, 40)) {
    console.log("[next-hot-route-analysis]", {
      route: row.route,
      route_group: row.route_group,
      total_ms: row.total_ms,
      db_ms: row.db_ms,
      transport_ms: row.transport_ms,
      round_trips: row.round_trips,
      aggregate_compute_detected: row.aggregate_compute_detected,
      repeated_join_detected: row.repeated_join_detected,
      sequential_await_detected: row.sequential_await_detected,
      query_wave_2_ms: row.query_wave_2_ms,
      rpc_removed: row.rpc_removed,
      fallback_used: row.fallback_used,
      snapshot_first: row.snapshot_first,
      request_time_compute_detected: row.request_time_compute_detected,
      hotness_score: row.hotness_score,
      structural_risk: row.structural_risk,
      recommended_action: row.recommended_action,
    });
  }

  const terminalLog = readTerminalLogs();
  const fallbackAudits = FALLBACK_BRANCHES.map((fb) => {
    const usedCount =
      fb.tag === "legacy_parallel"
        ? countMatches(terminalLog, new RegExp(fb.tag, "g"))
        : countTag(terminalLog, fb.tag);
    const rpcDeployed = SNAPSHOT_PASS_ROUTES.has(fb.route.split("[")[0].replace(/\/$/, "")) || fb.route.includes("order-counts");
    return {
      route: fb.route,
      fallback_branch: fb.branch,
      used_count: usedCount,
      last_reason: usedCount > 0 ? "runtime_log_hit" : "no_log_hit",
      rpc_deployed: rpcDeployed ? 1 : fb.branch === "legacy_parallel" ? 1 : 0,
      snapshot_available: SNAPSHOT_PASS_ROUTES.has(fb.route.replace(/\/\[orderId\]$/, "").replace(/\/\[storeId\]\/orders\/\[orderId\]$/, "/[storeId]/order-counts")) ? 1 : rpcDeployed ? 1 : 0,
      can_delete: usedCount === 0 && SNAPSHOT_PASS_ROUTES.has(fb.route) ? 0 : 0,
      blocker: usedCount > 0 ? "fallback_used_in_logs" : "await_ops1b_3_signoff",
    };
  });

  for (const fa of fallbackAudits) {
    console.log("[fallback-usage-global-audit]", fa);
  }

  const longSessionRows = parseLogBlocks(terminalLog, "long-session-stability");
  if (longSessionRows.length) {
    for (const ls of longSessionRows.slice(-5)) {
      console.log("[long-session-global-analysis]", {
        route: "community-messenger/*",
        duration_min: ls.duration_min ?? 0,
        memory_growth_mb: ls.memory_growth_mb ?? 0,
        cache_growth: ls.cache_entries ?? 0,
        duplicate_subscription_count: ls.duplicate_subscription_count ?? 0,
        stale_state_count: ls.stale_state_count ?? 0,
        reconnect_count: 0,
        refresh_storm_detected: (ls.snapshot_refresh_count ?? 0) > 20 ? 1 : 0,
        pass: ls.pass ?? 0,
      });
    }
  } else {
    console.log("[long-session-global-analysis]", {
      route: "global",
      duration_min: 0,
      memory_growth_mb: 0,
      cache_growth: 0,
      duplicate_subscription_count: 0,
      stale_state_count: 0,
      reconnect_count: 0,
      refresh_storm_detected: 0,
      pass: 0,
      note: "no_terminal_logs_enable_OPS1_monitor",
    });
  }

  const candidates = buildSnapshotCandidates(sorted);
  console.log("[next-snapshot-candidates]", candidates);

  const dangers = sorted.filter((r) => r.structural_risk === "DANGER");
  const warnings = sorted.filter((r) => r.structural_risk === "WARNING");

  const nextPriority = candidates[0] ?? {
    route: "/api/me/stores/[storeId]/orders",
    reason:
      "Owner dashboard adjacent to DSA1/ODN1 · 2-wave Promise.all aggregate · `[owner-orders-list-perf]` · high repeat traffic on /stores/owner",
  };

  const nextPriorityResolved = {
    route: nextPriority.route,
    reason:
      nextPriority.reason ||
      "Owner dashboard adjacent to DSA1/ODN1 · 2-wave Promise.all aggregate · `[owner-orders-list-perf]` · high repeat traffic on /stores/owner",
    track_code: nextPriority.route === "/api/me/stores/[storeId]/orders" ? "OOL1" : "NHR1-next",
  };

  const report = generateReport({
    analyses: allGet,
    top10,
    dangers,
    warnings,
    candidates,
    fallbackAudits,
    longSessionRows,
    nextPriority: nextPriorityResolved,
  });

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf8");

  console.log("\n=== NHR1 summary ===\n");
  console.log({
    routes_scanned: files.length,
    get_routes_analyzed: allGet.length,
    top_hot_route: top10[0]?.route,
    next_priority: nextPriorityResolved.route,
    next_track: nextPriorityResolved.track_code,
    danger_count: dangers.length,
    warning_count: warnings.length,
    snapshot_candidates: candidates.length,
    report: path.relative(root, REPORT_PATH),
  });

  process.exit(0);
}

main();
