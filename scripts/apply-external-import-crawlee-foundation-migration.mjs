/**
 * Apply ONLY 20261230150000_external_import_crawlee_foundation.sql
 *
 * NOTE: Local Docker Supabase is unavailable on this host (docker not found).
 * This uses the linked remote DB via SUPABASE_DB_PASSWORD — same path as prior
 * apply-*-migration.mjs scripts. Does NOT deploy Vercel Production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20261230150000_external_import_crawlee_foundation.sql";
const VERSION = "20261230150000";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM", "DISABLE ROW LEVEL SECURITY"]) {
    if (upper.includes(bad)) throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
  }
  for (const must of [
    "external_import_jobs",
    "external_sites",
    "external_boards",
    "external_articles",
    "external_article_documents",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
  }
  if (sql.includes("external_publish_links") || sql.includes("external_auth_sessions")) {
    throw new Error("CUT2 scope violation: publish_links/auth_sessions must not be in this migration");
  }
}

function psql(args, env) {
  const r = spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, ...env, PGSSLMODE: "require" },
  });
  if (r.status !== 0) {
    throw new Error(`psql failed: ${r.stderr || r.stdout || r.status}`);
  }
  return (r.stdout || "").trim();
}

loadEnvLocal();
const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!pass) {
  console.error("SUPABASE_DB_PASSWORD missing");
  process.exit(2);
}
const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(sqlPath, "utf8");
assertApprovedSql(sql);

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = "postgres.ckdosyydvgzqwpbwuhon";
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
if (existing === VERSION) {
  console.log(JSON.stringify({ alreadyRecorded: true, version: VERSION }));
} else {
  console.log("[apply] running migration SQL…");
  psql([...connArgs, "-f", sqlPath], env);
  psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${VERSION}') ON CONFLICT DO NOTHING`,
    ],
    env
  );
}

const check = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT string_agg(table_name, ',' ORDER BY table_name)
     FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN (
         'external_sites','external_boards','external_articles',
         'external_article_documents','external_import_jobs'
       )`,
  ],
  env
);

console.log(
  JSON.stringify(
    {
      migration: MIGRATION_FILE,
      version: VERSION,
      localDocker: false,
      applyTarget: "linked_remote_supabase_via_psql",
      vercelProductionDeploy: false,
      tables: check.split(",").filter(Boolean),
    },
    null,
    2
  )
);
