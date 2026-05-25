#!/usr/bin/env node
/**
 * OPS1-B — run prod sign-off N times; persist pass count for LFC1 hard-delete gate.
 *
 * Usage:
 *   SAMARKET_BASE_URL=https://your-app.vercel.app SAMARKET_PROD_PERF_MEASURE=1 npm run ops1:triple-signoff
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const runs = Math.max(1, Number(process.env.OPS1_SIGNOFF_RUNS ?? "3") || 3);
const baseUrl = process.env.SAMARKET_BASE_URL ?? "http://127.0.0.1:3000";
const isRemote = !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");

console.log("\n=== OPS1-B triple sign-off runner ===\n");
console.log({ baseUrl, runs, isRemote });

const results = [];
for (let i = 1; i <= runs; i++) {
  console.log(`\n--- signoff run ${i}/${runs} ---\n`);
  const proc = spawnSync("node", ["scripts/ops1-prod-same-region-signoff.mjs"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(proc.stdout ?? "");
  process.stderr.write(proc.stderr ?? "");
  const pass = proc.status === 0;
  results.push({ run: i, pass, exit_code: proc.status ?? 1 });
  if (!pass) console.warn(`run ${i} FAIL (exit ${proc.status})`);
}

const passCount = results.filter((r) => r.pass).length;
const statePath = path.join(root, "docs", "perf", "ops1b-signoff-state.json");
const state = {
  updated_at: new Date().toISOString(),
  base_url: baseUrl,
  runs_requested: runs,
  pass_count: passCount,
  results,
  prod_same_region_required: isRemote,
  gate_met: passCount >= 3 && isRemote,
};
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

console.log("\n=== OPS1-B triple sign-off summary ===\n");
console.log(state);
console.log(`\nWrote ${statePath}`);
console.log(`Set SAMARKET_OPS1B_SIGNOFF_PASS_COUNT=${passCount} for LFC1 delete gate\n`);

if (passCount >= 3 && isRemote) {
  console.log("OPS1-B gate MET (3/3 prod same-region sign-off PASS)\n");
  process.exit(0);
}
if (passCount >= 3 && !isRemote) {
  console.warn("WARN: 3/3 structural PASS on local_linked — prod same-region deploy still required\n");
  process.exit(0);
}
process.exit(1);
