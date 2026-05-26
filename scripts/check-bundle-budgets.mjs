import path from "path";
import { fileURLToPath } from "url";
import {
  BASELINE_REL,
  envInt,
  evaluateBundleBudgetLock,
  formatKb,
  loadBaseline,
  measureBundleMetrics,
} from "./lib/bundle-budget-metrics.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOP_N = envInt("SAMARKET_BUNDLE_BUDGET_TOP_N", 20);

let measured;
try {
  measured = measureBundleMetrics(root);
} catch (e) {
  if (e && typeof e === "object" && e.code === "ENOENT_BUILD") {
    console.error(String(e.message));
    console.error(`[bundle-budget] Run \`npm run build\` first.`);
    process.exit(1);
  }
  throw e;
}

let baselineFile;
try {
  baselineFile = loadBaseline(root);
} catch (e) {
  if (e && typeof e === "object" && e.code === "ENOENT_BASELINE") {
    console.error(String(e.message));
    console.error(`[bundle-budget] Commit ${BASELINE_REL} or run \`npm run check:bundle:update-baseline\` after build.`);
    process.exit(1);
  }
  throw e;
}

const { failures } = evaluateBundleBudgetLock(baselineFile, measured);

console.log(`[bundle-budget] lock baseline ${baselineFile.recordedAt} (${baselineFile.recordedFrom ?? "n/a"})`);
console.log(`[bundle-budget] total client js: ${formatKb(measured.totalBytes)}`);
console.log(`[bundle-budget] largest chunks:`);
for (const e of measured.entries.slice(0, TOP_N)) {
  console.log(`- ${formatKb(e.size)}  ${e.path}`);
}

const m = baselineFile.metrics;
const s = baselineFile.growth_slack_kb ?? {};
console.log(
  `[bundle-budget] messenger home: ${formatKb(measured.messenger.home.bytes)} (baseline ${m.messenger_home_js_kb}+${s.messenger_home_js ?? 200} KB, refs ${measured.messenger.home.refsCount})`
);
console.log(
  `[bundle-budget] messenger room: ${formatKb(measured.messenger.room.bytes)} (baseline ${m.messenger_room_js_kb}+${s.messenger_room_js ?? 200} KB, refs ${measured.messenger.room.refsCount})`
);
console.log(
  `[bundle-budget] messenger call: ${formatKb(measured.messenger.call.bytes)} (baseline ${m.messenger_call_js_kb}+${s.messenger_call_js ?? 300} KB, refs ${measured.messenger.call.refsCount})`
);

if (failures.length) {
  console.error(`[bundle-budget] FAIL: ${failures.length} metric(s) exceed baseline + growth slack`);
  for (const f of failures) {
    console.error(`  - ${f.message}`);
  }
  console.error(`[bundle-budget] If the increase is intentional: npm run build && npm run check:bundle:update-baseline`);
  console.error(`[bundle-budget] Then commit ${BASELINE_REL} with a short note in the PR.`);
  process.exit(2);
}

console.log(`[bundle-budget] PASS: within committed baseline + growth slack`);
