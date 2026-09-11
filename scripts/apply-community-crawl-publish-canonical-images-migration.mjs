/**
 * Apply 20261228120000_community_crawl_publish_canonical_images.sql
 * Usage: node --env-file=.env.local scripts/apply-community-crawl-publish-canonical-images-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20261228120000_community_crawl_publish_canonical_images.sql";
const VERSION = "20261228120000";

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
  if (!sql.includes("community_crawl_publish_full_content")) throw new Error("missing RPC");
  if (!sql.includes("INSERT INTO public.community_post_images")) {
    throw new Error("must insert community_post_images");
  }
  if (!sql.includes("DELETE FROM public.community_post_images")) {
    throw new Error("must replace-set community_post_images");
  }
  for (const bad of ["DROP TABLE", "TRUNCATE", "DISABLE ROW LEVEL SECURITY"]) {
    if (sql.toUpperCase().includes(bad)) throw new Error(`contains ${bad}`);
  }
}

function psql(args, env) {
  const r = spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, ...env, PGSSLMODE: "require" },
  });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr || r.stdout || r.status}`);
  return (r.stdout || "").trim();
}

loadEnvLocal();
const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!pass) {
  console.error("SUPABASE_DB_PASSWORD missing");
  process.exit(2);
}
const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
assertApprovedSql(readFileSync(sqlPath, "utf8"));

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = "postgres.ckdosyydvgzqwpbwuhon";
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
psql([...connArgs, "-f", sqlPath], env);
if (existing !== VERSION) {
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

const def = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT pg_get_functiondef('public.community_crawl_publish_full_content(jsonb)'::regprocedure)`,
  ],
  env
);
console.log(
  JSON.stringify({
    ok: true,
    version: VERSION,
    hasPostImagesInsert: /INSERT\s+INTO\s+public\.community_post_images/i.test(def),
    hasPostImagesDelete: /DELETE\s+FROM\s+public\.community_post_images/i.test(def),
    hasUpdated: def.includes("'updated'"),
  })
);
