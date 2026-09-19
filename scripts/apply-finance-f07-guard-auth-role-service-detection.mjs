#!/usr/bin/env node
/**
 * CUT E1 — apply ONLY 20270119130000_finance_f07_guard_auth_role_service_detection.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 *   node --env-file=.env.local scripts/apply-finance-f07-guard-auth-role-service-detection.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270119130000_finance_f07_guard_auth_role_service_detection.sql";
const OUT_DIR = resolve(process.cwd(), ".tmp/cut-e1-f07-guard");

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM", "DROP FUNCTION"]) {
    if (code.includes(bad)) throw new Error(`forbidden ${bad}`);
  }
  if (!code.includes("CREATE OR REPLACE FUNCTION PUBLIC.GUARD_PROFILES_SELF_UPDATE")) {
    throw new Error("missing guard replace");
  }
  if (!code.includes("AUTH.ROLE()")) throw new Error("missing auth.role() detection");
  if (!code.includes("PROFILES_POINTS_DIRECT_UPDATE_FORBIDDEN")) {
    throw new Error("missing forbidden exception");
  }
  if (!code.includes("REQUEST_ROLE = 'SERVICE_ROLE'")) {
    throw new Error("missing service_role allow via auth.role");
  }
}

function runLinkedSqlFile(absPath, label) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", absPath], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const abs = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(abs, "utf8");
assertApprovedSql(sql);
console.log(`[apply] ${MIGRATION_FILE}`);
runLinkedSqlFile(abs, "f07_guard_auth_role");
writeFileSync(resolve(OUT_DIR, "applied.json"), JSON.stringify({ ok: true, file: MIGRATION_FILE }, null, 2));
console.log("[PASS] F-07 guard auth.role() service detection applied");
