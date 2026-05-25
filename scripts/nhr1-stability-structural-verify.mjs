#!/usr/bin/env node
/**
 * NHR1 structural verify — discovery script + report exist.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fails = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) fails.push(`missing: ${rel}`);
}

console.log("\n=== NHR1 structural verify ===\n");

mustExist("scripts/nhr1-next-hot-route-discovery.mjs");
mustExist("docs/perf/next-hot-route-priority-report.md");

const script = fs.readFileSync(path.join(root, "scripts/nhr1-next-hot-route-discovery.mjs"), "utf8");
for (const tag of [
  "next-hot-route-analysis",
  "next-snapshot-candidates",
  "fallback-usage-global-audit",
  "long-session-global-analysis",
  "hotness_score",
  "structural_risk",
]) {
  if (!script.includes(tag)) fails.push(`script missing tag/field: ${tag}`);
}

if (fails.length) {
  for (const f of fails) console.error("FAIL:", f);
  process.exit(1);
}
console.log("NHR1 structural verify PASS\n");
