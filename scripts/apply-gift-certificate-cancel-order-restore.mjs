#!/usr/bin/env node
/**
 * Apply ONLY 20270101130000_gift_certificate_cancel_order_restore via linked CLI.
 * Does NOT run supabase db push / other migrations.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270101130000_gift_certificate_cancel_order_restore.sql";
const VERSION = "20270101130000";
const OUT_DIR = resolve(process.cwd(), ".tmp/delivery-confirmed-root-impl");

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (code.includes(bad)) throw new Error(`forbidden ${bad}`);
  }
  for (const must of [
    "CREATE OR REPLACE FUNCTION public.gift_certificate_cancel_order_restore",
    "gift_certificate_redemption_reverse",
    "GRANT EXECUTE ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) TO service_role",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
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

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut2-gift-cancel-${process.pid}-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    return runLinkedSqlFile(tmp, label);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function parseJsonRows(out) {
  const text = String(out || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.rows) return parsed.rows;
  } catch {
    /* fall through */
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* ignore */
    }
  }
  return [];
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const hist = parseJsonRows(
    runLinkedSqlText(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
      "history-check"
    )
  );
  const already = hist.some((r) => String(r.version || "") === VERSION);
  // Always re-apply CREATE OR REPLACE + privilege revoke (idempotent).
  runLinkedSqlFile(path, MIGRATION_FILE);
  if (!already) {
    runLinkedSqlText(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', '${MIGRATION_FILE}')
       ON CONFLICT DO NOTHING;`,
      "record-history"
    );
  }

  const fn = parseJsonRows(
    runLinkedSqlText(
      `SELECT p.proname,
              has_function_privilege('service_role', p.oid, 'execute') AS service_exec,
              has_function_privilege('anon', p.oid, 'execute') AS anon_exec
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'gift_certificate_cancel_order_restore';`,
      "verify-fn"
    )
  );
  if (!fn.length || !fn[0].service_exec) throw new Error("RPC missing or not service_role executable");
  if (fn[0].anon_exec) throw new Error("RPC must not be anon executable");

  const report = { appliedOrPresent: true, alreadyRecorded: already, fn: fn[0], measuredAt: new Date().toISOString() };
  writeFileSync(resolve(OUT_DIR, "cut2-db-apply-proof.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "DONE", ...report }, null, 2));
}

main();
