#!/usr/bin/env node
/**
 * Apply ONLY 20270326120000_intro_v2_data_model_rls_publication
 * via linked CLI. Does NOT run `supabase db push`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270326120000_intro_v2_data_model_rls_publication.sql";
const VERSION = "20270326120000";
const NAME = "intro_v2_data_model_rls_publication";
const TABLES = [
  "intro_campaigns",
  "intro_scenes",
  "intro_assets",
  "intro_publications",
  "intro_device_overrides",
];

function assertApprovedSql(sql) {
  const upper = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DROP SCHEMA", "VERCEL --PROD"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  if (sql.includes("admin_settings") && /UPDATE\s+public\.admin_settings/i.test(sql)) {
    throw new Error("must not mutate admin_settings");
  }
  for (const must of [
    "intro_campaigns",
    "intro_publications",
    "get_intro_published_manifest",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "requires_admin_confirmation",
    "v1_displayDurationMs_0_not_guessed_as_timer",
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
  const tmp = resolve(process.cwd(), `.tmp-intro-v2-phase1-${process.pid}-${Date.now()}.sql`);
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
const applyOut = runLinkedSqlFile(abs, "apply intro v2");
mkdirSync(resolve(process.cwd(), ".tmp/intro-v2-phase1"), { recursive: true });
writeFileSync(resolve(process.cwd(), ".tmp/intro-v2-phase1/APPLY.log"), applyOut, "utf8");

runLinkedSqlText(
  `INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('${VERSION}', '${NAME}')
   ON CONFLICT (version) DO NOTHING;`,
  "record schema_migrations"
);

const check = runLinkedSqlText(
  `SELECT json_build_object(
     'tables', (
       SELECT json_object_agg(t, exists)
       FROM (
         SELECT unnest(ARRAY[${TABLES.map((t) => `'${t}'`).join(",")}]) AS t
       ) x
       CROSS JOIN LATERAL (
         SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name=x.t
         ) AS exists
       ) e
     ),
     'migration', (
       SELECT version FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
     )
   );`,
  "post-apply table check"
);
console.log(check);
console.log("[OK] intro v2 phase 1 migration applied");
