import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  BASELINE_REL,
  loadBaseline,
  measureBundleMetrics,
  metricsToBaselinePayload,
} from "./lib/bundle-budget-metrics.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, BASELINE_REL);
const force = process.argv.includes("--force");

let measured;
try {
  measured = measureBundleMetrics(root);
} catch (e) {
  if (e && typeof e === "object" && e.code === "ENOENT_BUILD") {
    console.error(String(e.message));
    console.error(`[bundle-budget:update] Run \`npm run build\` first.`);
    process.exit(1);
  }
  throw e;
}

const nextMetrics = metricsToBaselinePayload(measured, 12);
let prev = null;
if (fs.existsSync(baselinePath)) {
  try {
    prev = loadBaseline(root);
  } catch {
    prev = null;
  }
}

if (prev && !force) {
  const prevTotal = prev.metrics?.total_client_js_kb ?? 0;
  const nextTotal = nextMetrics.total_client_js_kb;
  const slack = prev.growth_slack_kb?.total_client_js ?? 500;
  const maxAllowed = prevTotal + slack;
  if (nextTotal <= maxAllowed) {
    console.log(
      `[bundle-budget:update] No update needed: ${nextTotal} KB <= baseline ${prevTotal} + slack ${slack} (= ${maxAllowed} KB)`
    );
    console.log(`[bundle-budget:update] Use --force to rewrite baseline anyway.`);
    process.exit(0);
  }
}

const payload = {
  recordedAt: new Date().toISOString().slice(0, 10),
  recordedFrom: "npm run check:bundle:update-baseline",
  metrics: {
    total_client_js_kb: nextMetrics.total_client_js_kb,
    messenger_home_js_kb: nextMetrics.messenger_home_js_kb,
    messenger_room_js_kb: nextMetrics.messenger_room_js_kb,
    messenger_call_js_kb: nextMetrics.messenger_call_js_kb,
  },
  growth_slack_kb: prev?.growth_slack_kb ?? {
    total_client_js: 500,
    messenger_home_js: 200,
    messenger_room_js: 200,
    messenger_call_js: 300,
  },
  top_chunks: nextMetrics.top_chunks,
};

fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

if (prev?.metrics) {
  const d = nextMetrics.total_client_js_kb - (prev.metrics.total_client_js_kb ?? 0);
  console.log(`[bundle-budget:update] total client js delta: ${d >= 0 ? "+" : ""}${d} KB`);
}
console.log(`[bundle-budget:update] wrote ${BASELINE_REL}`);
console.log(JSON.stringify(payload.metrics, null, 2));
