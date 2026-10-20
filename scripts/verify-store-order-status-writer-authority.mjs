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

/**
 * DB writers of order_status (SECURITY DEFINER, service_role only) — callable only from
 * applyStoreOrderStatusTransition so the TS state machine + side effects stay single-path.
 * ORD-06 added the owner cancel / cancel-request decision functions (ledger + status in one TX).
 */
const STATUS_WRITER_RPCS = [
  "store_order_buyer_cancel_request_atomic",
  "store_order_owner_cancel_atomic",
  "store_order_cancel_request_decide_atomic",
  // Stage 2-C: plain cancels (buyer pre-accept, admin direct, SYSTEM) with coupon/gift/delivery side effects in one TX.
  "store_order_cancel_direct_atomic",
];
const applyAbs = path.join(root, "lib/stores/apply-store-order-status-transition.ts");
const applySrc = fs.readFileSync(applyAbs, "utf8");
for (const fn of STATUS_WRITER_RPCS) {
  if (!applySrc.includes(`"${fn}"`)) fails.push(`apply must call DB status writer ${fn}`);
  // positive globs first: rg applies the LAST matching glob, so the exclusions must come after.
  const hits = rg([
    "-l",
    "-g",
    "*.ts",
    "-g",
    "*.tsx",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/scripts/**",
    "--glob",
    "!**/supabase/**",
    "--glob",
    "!**/*.test.ts",
    "--glob",
    "!**/__tests__/**",
    "--glob",
    "!**/docs/**",
    `["'\`]${fn}["'\`]`,
  ]);
  for (const rel of hits.split("\n").filter(Boolean)) {
    if (path.join(root, rel) !== applyAbs) fails.push(`${rel}: DB status writer ${fn} called outside apply`);
  }
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
