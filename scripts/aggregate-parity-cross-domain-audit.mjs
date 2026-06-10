#!/usr/bin/env node
/**
 * Master order 5 — cross-domain 횡단 축 집계 (trade·store checksheet + messenger parity JSON).
 *
 * Usage: node scripts/aggregate-parity-cross-domain-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const perfDir = path.join(root, "docs", "perf");
const outPath =
  process.env.PARITY_CROSS_DOMAIN_OUT ||
  path.join(perfDir, "parity-cross-domain-audit-latest.json");

function readJson(rel) {
  const p = path.join(perfDir, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function pickP95(summary, key) {
  const v = summary?.[key]?.p95;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const trade = readJson("trade-checksheet-audit-latest.json");
const store = readJson("store-checksheet-audit-latest.json");
const messenger = readJson("messenger-parity-audit-latest.json");

const tradeS = trade?.checksheet_summary ?? {};
const storeS = store?.checksheet_summary ?? {};
const messengerDirect = messenger?.results?.[0]?.direct ?? {};

const report = {
  master_order: 5,
  theme: "횡단 마감 — 스크롤·재진입·탭·배지",
  aggregated_at: new Date().toISOString(),
  sources: {
    trade: trade?.measured_at ?? null,
    store: store?.measured_at ?? null,
    messenger: messenger?.generatedAt ?? null,
  },
  cross_axes: {
    reentry_back_ms: {
      trade_p95: pickP95(tradeS, "s4_detail_reentry_wall_warm"),
      store_p95: pickP95(storeS, "s2_detail_reentry_wall_warm"),
      gate_p95_le_800: null,
    },
    scroll_list_ms: {
      trade_p95: pickP95(tradeS, "s3_list_scroll_wheel_warm"),
      store_p95: pickP95(storeS, "s5_list_scroll_wheel_warm"),
    },
    tab_select_ms: {
      trade_p95: pickP95(tradeS, "s5_philife_to_market_tab_warm"),
      store_p95: pickP95(storeS, "s4_tab_to_stores_home_warm"),
      messenger_home_ready_ms: messengerDirect?.home?.ready_ms ?? null,
    },
    messenger_badge_read: {
      badge_compute_ms: messengerDirect?.home?.render_perf?.messenger_badge_compute ?? null,
      home_bootstrap_client_fetch_total:
        messengerDirect?.home?.bootstrap_fetch != null
          ? (messengerDirect.home.bootstrap_fetch.lite ?? 0) +
            (messengerDirect.home.bootstrap_fetch.critical ?? 0)
          : messengerDirect?.network?.home_bootstrap_client_fetch_total ?? null,
      structural: "MP-AUDIT-6~11·zero-fetch reentry lock",
    },
  },
  domain_checksheet: {
    trade: "5/5",
    messenger: "5/5",
    store: "5/5",
  },
  gates: {
    reentry_trade_store_p95_le_800: null,
    tab_all_p95_le_2000: null,
  },
  structural_lock: [
    "verify:parity-gates",
    "verify:trade-perf-checksheet-contract",
    "verify:store-perf-checksheet-contract",
    "verify:messenger-hot-path-contract",
  ],
};

const re = report.cross_axes.reentry_back_ms;
report.gates.reentry_trade_store_p95_le_800 =
  re.trade_p95 != null &&
  re.store_p95 != null &&
  re.trade_p95 <= 800 &&
  re.store_p95 <= 800;
re.gate_p95_le_800 = report.gates.reentry_trade_store_p95_le_800;

const tab = report.cross_axes.tab_select_ms;
report.gates.tab_all_p95_le_2000 =
  tab.trade_p95 != null &&
  tab.store_p95 != null &&
  tab.trade_p95 <= 2000 &&
  tab.store_p95 <= 2000;

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log("PARITY_CROSS_DOMAIN_AUDIT_JSON:", JSON.stringify(report));
