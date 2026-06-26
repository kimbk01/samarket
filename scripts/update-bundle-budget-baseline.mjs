import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  BASELINE_REL,
  buildBaselineProvenanceFromRoot,
  evaluateBundleBudgetLock,
  loadBaseline,
  measureBundleMetrics,
  metricsToBaselinePayload,
  validateBaselineIntegrity,
} from "./lib/bundle-budget-metrics.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, BASELINE_REL);
const force = process.argv.includes("--force");
const allowRegression = process.argv.includes("--allow-regression");

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
const provenance = buildBaselineProvenanceFromRoot(root, measured);

let prev = null;
if (fs.existsSync(baselinePath)) {
  try {
    prev = loadBaseline(root);
  } catch {
    prev = null;
  }
}

if (prev && !force) {
  const { failures } = evaluateBundleBudgetLock(prev, measured);
  if (failures.length === 0) {
    console.log(`[bundle-budget:update] No update needed: within baseline ± growth slack`);
    console.log(`[bundle-budget:update] Use --force to rewrite baseline anyway.`);
    process.exit(0);
  }

  const shrinkFailures = failures.filter((f) => f.direction === "under_min");
  if (shrinkFailures.length > 0 && !allowRegression) {
    console.error(
      `[bundle-budget:update] Bundle shrank below baseline − slack (${shrinkFailures.length} metric(s)); CI will fail until baseline is refreshed.`
    );
    for (const f of shrinkFailures) {
      console.error(`  - ${f.message}`);
    }
    console.error(
      `[bundle-budget:update] Pass --allow-regression if shrink is intentional (e.g. dynamic import / SSR isolation).`
    );
    process.exit(1);
  }
}

if (prev?.metrics && nextMetrics.total_client_js_kb < (prev.metrics.total_client_js_kb ?? 0) && !allowRegression && !force) {
  console.error(
    `[bundle-budget:update] Refusing to lower total_client_js_kb (${prev.metrics.total_client_js_kb} → ${nextMetrics.total_client_js_kb}).`
  );
  console.error(`[bundle-budget:update] Pass --allow-regression if bundle shrink is intentional.`);
  process.exit(1);
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
  provenance,
};

const integrity = validateBaselineIntegrity(payload);
if (!integrity.ok) {
  console.error(`[bundle-budget:update] internal integrity check failed:`);
  for (const err of integrity.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

if (prev?.metrics) {
  const d = nextMetrics.total_client_js_kb - (prev.metrics.total_client_js_kb ?? 0);
  console.log(`[bundle-budget:update] total client js delta: ${d >= 0 ? "+" : ""}${d} KB`);
}
console.log(`[bundle-budget:update] wrote ${BASELINE_REL} (build_id=${provenance.build_id ?? "n/a"}, chunks=${provenance.chunk_file_count})`);
console.log(JSON.stringify(payload.metrics, null, 2));
