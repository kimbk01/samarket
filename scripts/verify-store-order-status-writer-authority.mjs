#!/usr/bin/env node
/**
 * Phase 6A — runtime store_orders.order_status writers must be:
 * - POST create insert (app/api/me/store-orders/route.ts)
 * - applyStoreOrderStatusTransition
 * Scripts / migrations / tests excluded.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_FILES = new Set([
  path.join(root, "lib/stores/apply-store-order-status-transition.ts"),
  path.join(root, "app/api/me/store-orders/route.ts"),
]);

function rg(args) {
  try {
    return execFileSync("rg", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    if (e.status === 1) return "";
    throw e;
  }
}

const multi = rg([
  "-n",
  "--multiline",
  "--glob",
  "!**/node_modules/**",
  "--glob",
  "!**/.qa-logs/**",
  "--glob",
  "!**/scripts/**",
  "--glob",
  "!**/supabase/migrations/**",
  "--glob",
  "!**/*.test.ts",
  "--glob",
  "!**/*.test.tsx",
  "--glob",
  "!**/__tests__/**",
  "-g",
  "*.ts",
  "-g",
  "*.tsx",
  String.raw`from\(\s*["']store_orders["']\s*\)[\s\S]{0,200}\.update\(`,
]);

const fails = [];

for (const line of multi.split("\n").filter(Boolean)) {
  const m = /^([^:]+):(\d+)/.exec(line);
  if (!m) continue;
  const rel = m[1];
  const abs = path.join(root, rel);
  const startLine = Number(m[2]);
  if (ALLOWED_FILES.has(abs)) continue;
  if (rel.startsWith("scripts/") || rel.includes("/scripts/")) continue;

  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  const snippet = lines.slice(Math.max(0, startLine - 1), startLine + 24).join("\n");
  if (!/\border_status\b\s*:/.test(snippet)) continue;

  fails.push(`${rel}:${startLine}\n${snippet.slice(0, 280)}`);
}

if (fails.length) {
  console.error("FAIL: runtime store_orders order_status UPDATE outside apply/create:\n");
  console.error(fails.join("\n---\n"));
  process.exit(1);
}

console.log(
  "PASS: store-order-status-writer-authority (order_status UPDATE only in apply + create insert)"
);
process.exit(0);
