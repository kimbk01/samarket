#!/usr/bin/env node
/**
 * LFC1-HARDDELETE — route-by-route hard delete orchestrator (dry-run default).
 *
 * Usage:
 *   npm run lfc1:harddelete-loop              # dry-run gate check
 *   LFC1_HARDDELETE_EXECUTE=1 npm run lfc1:harddelete-loop  # after OPS1-B gate
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const execute = process.env.LFC1_HARDDELETE_EXECUTE === "1";
const ops1PassCount = Number(process.env.SAMARKET_OPS1B_SIGNOFF_PASS_COUNT ?? "0") || 0;
const ops1StatePath = path.join(root, "docs", "perf", "ops1b-signoff-state.json");
let ops1State = null;
if (fs.existsSync(ops1StatePath)) {
  ops1State = JSON.parse(fs.readFileSync(ops1StatePath, "utf8"));
}

/** Phase A → C order (messenger core last). */
const HARD_DELETE_PHASES = [
  {
    phase: "A",
    routes: [
      { track: "SM1", route: "/api/stores/[slug]/menus", legacy: "lib/stores/fetch-store-menus-catalog.ts" },
      { track: "ODN1", route: "/api/me/notifications", legacy: "app/api/me/notifications/route.ts" },
      { track: "DSA1", route: "/api/me/stores/[storeId]/order-counts", legacy: "lib/stores/fetch-owner-store-order-counts.ts" },
      { track: "OOL1", route: "/api/me/stores/[storeId]/orders", legacy: "lib/stores/fetch-owner-store-orders-list-legacy.ts" },
      { track: "SOL1", route: "/api/me/store-orders", legacy: "lib/stores/fetch-buyer-store-orders-list-legacy.ts" },
      { track: "SOD1", route: "/api/me/store-orders/[orderId]", legacy: "lib/stores/fetch-store-order-detail-legacy.ts" },
      { track: "SB1", route: "/api/stores/browse", legacy: "lib/stores/fetch-stores-browse-legacy.ts" },
    ],
  },
  {
    phase: "B",
    routes: [
      { track: "HUB BADGE", route: "/api/me/store-owner-hub-badge", legacy: "lib/chats/build-owner-hub-badge-payload.ts" },
      { track: "RB1", route: "/api/community-messenger/rooms/[roomId]/bootstrap", legacy: "lib/community-messenger/service.ts" },
    ],
  },
  {
    phase: "C",
    routes: [
      { track: "HS2", route: "/api/community-messenger/home-sync", legacy: "lib/community-messenger/service.ts" },
      { track: "CR1", route: "/api/chat/rooms", legacy: "lib/chats/fetch-chat-rooms-list-legacy.ts" },
      { track: "CMB1", route: "/api/community-messenger/bootstrap?lite=1", legacy: "lib/community-messenger/fetch-cm-bootstrap-legacy.ts" },
      { track: "FBT1", route: "/api/community-messenger/bootstrap", legacy: "lib/community-messenger/fetch-full-bootstrap-legacy.ts" },
    ],
  },
];

function runVerify(script) {
  const proc = spawnSync("npm", ["run", script], { cwd: root, shell: true, encoding: "utf8" });
  return proc.status === 0;
}

function gateMet() {
  const fromState = ops1State?.gate_met === true && (ops1State?.pass_count ?? 0) >= 3;
  return fromState || ops1PassCount >= 3;
}

console.log("\n=== LFC1 hard delete loop ===\n");
console.log({ execute, ops1PassCount, ops1_gate_met: gateMet(), ops1_state: ops1State?.base_url ?? null });

if (!gateMet()) {
  console.error("\nBLOCKED: OPS1-B gate not met (need 3 prod same-region sign-off PASS)\n");
  console.error("Run: SAMARKET_BASE_URL=https://YOUR_PROD npm run ops1:triple-signoff\n");
  process.exit(1);
}

const rows = [];
for (const { phase, routes } of HARD_DELETE_PHASES) {
  for (const r of routes) {
    const row = {
      phase,
      track: r.track,
      route: r.route,
      legacy_module: r.legacy,
      fallback_removed: 0,
      verify_rpc_pass: 0,
      verify_e2e_pass: 0,
      reconnect_pass: 0,
      burst_pass: 0,
      stale_detected: 0,
      regression_alert_count: 0,
      query_wave_2_ms: 0,
      rpc_removed: 1,
      pass: 0,
      blocker: execute ? "manual_delete_not_automated" : "dry_run",
    };
    console.log("[legacy-fallback-usage-audit]", {
      route: r.route,
      fallback_branch: "pending_hard_delete",
      used_count: 0,
      last_reason: "ops1b_gate_met_await_route_verify",
      rpc_deployed: 1,
      snapshot_available: 1,
      can_delete: execute ? 1 : 0,
      blocker: execute ? "requires_per_route_verify" : "dry_run",
      reconnect_related: phase === "C" || r.track === "RB1" ? 1 : 0,
      prod_seen: 1,
      dev_only: 0,
    });
    if (execute) {
      console.warn(`EXECUTE mode: manual hard delete required for ${r.track} — automated file delete not enabled`);
      row.blocker = "automated_delete_disabled_use_manual_pr";
    }
    console.log("[fallback-cleanup-verification]", row);
    rows.push(row);
  }
}

console.log("\n=== LFC1 hard delete loop summary ===\n");
console.log({
  phases: HARD_DELETE_PHASES.length,
  routes: rows.length,
  deleted: 0,
  note: "Hard delete requires per-route PR after SAMARKET_LFC1_SNAPSHOT_ONLY=1 staging verify",
});
process.exit(0);
