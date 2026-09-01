#!/usr/bin/env node
/**
 * Community Point financial HARD LOCK gate.
 * @see docs/dibay-community-dpoint-financial-hard-lock.md
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const sql = read("supabase/migrations/20261027120000_community_dpoint_financial_writer.sql");
if (!sql.includes("apply_community_point_reward")) fail("migration missing reward RPC");
if (!sql.includes("apply_community_point_reclaim")) fail("migration missing reclaim RPC");
if (!sql.includes("uq_point_ledger_community_reward_source")) fail("migration missing reward UNIQUE");
if (sql.includes("Math.random")) fail("migration must not roll random in SQL");

const det = read("lib/community-points/deterministic-award.ts");
if (det.includes("Math.random(")) fail("deterministic-award uses Math.random");

const sim = read("lib/point-policies/point-reward-simulate-core.ts");
if (sim.includes("Math.random(")) fail("simulate-core still uses Math.random");

const bridge = read("lib/points/community-point-bridge.ts");
if (bridge.includes("executePointRewardServer")) fail("bridge still calls non-atomic executePointRewardServer");
if (bridge.includes("voidCommunityPointRewardOnPostWrite")) fail("bridge still exposes void reward");
if (!bridge.includes("applyCommunityPointRewardOnPostWrite")) fail("bridge missing await reward");

const reports = read("app/api/admin/community-reports/[id]/route.ts");
if (/createSanction|banUser/i.test(reports)) fail("community reports grew a sanction writer");

const vitest = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "lib/community-points/__tests__/community-dpoint-financial-contract.test.ts",
    "lib/community-feed/__tests__/community-admin-cd-surface-contract.test.ts",
    "lib/points/__tests__/community-point-board-key.test.ts",
    "lib/points/__tests__/point-financial-history.test.ts",
  ],
  { stdio: "inherit", shell: process.platform === "win32" }
);
if (vitest.status !== 0) fail("contract vitest");

console.log("PASS: community-dpoint-financial-hard-lock");
process.exit(0);
