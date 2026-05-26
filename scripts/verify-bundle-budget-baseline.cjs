/**
 * Committed bundle baseline JSON must stay valid before CI build.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const baselinePath = path.join(root, "scripts", "bundle-budget-baseline.json");

function fail(msg) {
  console.error(`verify-bundle-budget-baseline: ${msg}`);
  process.exitCode = 1;
}

if (!fs.existsSync(baselinePath)) {
  fail("missing scripts/bundle-budget-baseline.json");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
} catch (e) {
  fail(`invalid JSON: ${e.message}`);
  process.exit(1);
}

const requiredMetricKeys = [
  "total_client_js_kb",
  "messenger_home_js_kb",
  "messenger_room_js_kb",
  "messenger_call_js_kb",
];
for (const k of requiredMetricKeys) {
  const v = data.metrics?.[k];
  if (!Number.isFinite(v) || v <= 0) fail(`metrics.${k} must be a positive number`);
}

const slackKeys = [
  "total_client_js",
  "messenger_home_js",
  "messenger_room_js",
  "messenger_call_js",
];
for (const k of slackKeys) {
  const v = data.growth_slack_kb?.[k];
  if (!Number.isFinite(v) || v < 0) fail(`growth_slack_kb.${k} must be a non-negative number`);
}

if (!Array.isArray(data.top_chunks) || data.top_chunks.length < 1) {
  fail("top_chunks must be a non-empty array");
}

if (!process.exitCode) {
  console.log("verify-bundle-budget-baseline: OK");
}
