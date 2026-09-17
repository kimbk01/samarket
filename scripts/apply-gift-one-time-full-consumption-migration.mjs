#!/usr/bin/env node
/**
 * Apply ONLY 20270117140000_gift_one_time_full_consumption via linked CLI.
 * Does NOT run supabase db push / other migrations.
 *
 *   node --env-file=.env.local scripts/apply-gift-one-time-full-consumption-migration.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270117140000_gift_one_time_full_consumption.sql";
const VERSION = "20270117140000";
const OUT_DIR = resolve(process.cwd(), ".tmp/gift-one-time-full-consumption");

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
    "forfeited_amount",
    "CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse",
    "CREATE OR REPLACE FUNCTION public.create_store_order_atomic",
    "CREATE OR REPLACE FUNCTION public.gift_certificate_offer",
    "'FORFEIT'",
    "'FORFEIT_REVERSE'",
    "v_gift_status := 'FULLY_REDEEMED'",
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
  const tmp = resolve(process.cwd(), `.tmp-gift-one-time-${process.pid}-${Date.now()}.sql`);
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
  runLinkedSqlFile(path, MIGRATION_FILE);
  if (!already) {
    runLinkedSqlText(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', '${MIGRATION_FILE}')
       ON CONFLICT DO NOTHING;`,
      "record-history"
    );
  }

  const col = parseJsonRows(
    runLinkedSqlText(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'gift_certificate_redemptions'
          AND column_name = 'forfeited_amount';`,
      "verify-column"
    )
  );
  if (!col.length) throw new Error("forfeited_amount column missing");

  const report = {
    appliedOrPresent: true,
    alreadyRecorded: already,
    forfeitedColumn: col[0],
    measuredAt: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT_DIR, "db-apply-proof.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "DONE", ...report }, null, 2));
}

main();
