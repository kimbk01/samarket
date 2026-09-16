#!/usr/bin/env node
/**
 * Apply ONLY 20270101120000_stores_one_owner_one_store_unique via linked CLI.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node scripts/apply-stores-one-owner-one-store-unique.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270101120000_stores_one_owner_one_store_unique.sql";
const VERSION = "20270101120000";
const OUT_DIR = resolve(process.cwd(), ".tmp/delivery-confirmed-root-impl");

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM", "UPDATE "]) {
    if (code.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "CREATE UNIQUE INDEX IF NOT EXISTS stores_one_owner_one_store_uidx",
    "ON public.stores (owner_user_id)",
    "WHERE owner_user_id IS NOT NULL",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

function runLinkedSqlFile(absPath, label) {
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", absPath],
    {
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    }
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut1-owner-unique-${process.pid}-${Date.now()}.sql`);
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
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
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

  console.log(
    JSON.stringify(
      {
        phase: "PLAN",
        approvedMigration: MIGRATION_FILE,
        version: VERSION,
        otherMigrations: "NONE",
      },
      null,
      2
    )
  );

  const histOut = runLinkedSqlText(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
    "history-check"
  );
  const hist = parseJsonRows(histOut);
  const already = hist.some((r) => String(r.version || r.VERSION || "") === VERSION);

  if (!already) {
    runLinkedSqlFile(path, MIGRATION_FILE);
    runLinkedSqlText(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', '${MIGRATION_FILE}')
       ON CONFLICT DO NOTHING;`,
      "record-history"
    );
  }

  const idxOut = runLinkedSqlText(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'stores'
       AND indexname = 'stores_one_owner_one_store_uidx';`,
    "verify-index"
  );
  const idxRows = parseJsonRows(idxOut);
  if (!idxRows.length) {
    throw new Error("stores_one_owner_one_store_uidx missing after apply");
  }

  const blockOut = runLinkedSqlText(
    `WITH sample AS (
       SELECT owner_user_id AS uid FROM public.stores WHERE owner_user_id IS NOT NULL LIMIT 1
     )
     SELECT
       (SELECT uid FROM sample) AS owner_user_id,
       EXISTS (
         SELECT 1 FROM public.stores s, sample
         WHERE s.owner_user_id = sample.uid
       ) AS owner_already_has_store;`,
    "sample-owner"
  );

  const report = {
    appliedOrPresent: true,
    alreadyRecorded: already,
    index: idxRows[0],
    sample: parseJsonRows(blockOut)[0] || null,
    measuredAt: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT_DIR, "cut1-db-apply-proof.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "DONE", ...report }, null, 2));
}

main();
