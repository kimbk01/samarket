#!/usr/bin/env node
/**
 * Apply ONLY 20270329120000_intro_v2_phase2_composition_tokens
 * via linked CLI. Does NOT run `supabase db push`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270329120000_intro_v2_phase2_composition_tokens.sql";
const VERSION = "20270329120000";

function assertApprovedSql(sql) {
  const upper = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DROP SCHEMA", "DROP POLICY", "VERCEL --PROD"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  if (/CREATE\s+TABLE/i.test(upper) || /ALTER\s+TABLE/i.test(upper)) {
    throw new Error("must not create/alter tables");
  }
  for (const must of ["intro_v2_layer_ok", "visible", "decorationKind", "CREATE OR REPLACE FUNCTION"]) {
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
  const tmp = resolve(process.cwd(), `.tmp-intro-v2-phase2-${process.pid}-${Date.now()}.sql`);
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

const abs = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(abs, "utf8");
assertApprovedSql(sql);

const already = runLinkedSqlText(
  `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
  "check schema_migrations"
);
if (already.includes(VERSION)) {
  console.log(`[SKIP] ${VERSION} already in schema_migrations`);
  process.exit(0);
}

console.log(`[APPLY] ${MIGRATION_FILE}`);
const applyOut = runLinkedSqlFile(abs, "apply phase2 composition tokens");
runLinkedSqlText(
  `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('${VERSION}', 'intro_v2_phase2_composition_tokens', ARRAY[]::text[])
   ON CONFLICT (version) DO NOTHING;`,
  "record schema_migrations"
);
mkdirSync(resolve(process.cwd(), ".tmp/intro-phase2/migration"), { recursive: true });
writeFileSync(
  resolve(process.cwd(), ".tmp/intro-phase2/migration/APPLY_PHASE2_TOKENS.log"),
  applyOut.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"),
  "utf8"
);
console.log(`[OK] ${VERSION}`);
