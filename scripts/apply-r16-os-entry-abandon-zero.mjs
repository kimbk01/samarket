/**
 * R16 FULL REVERT — empty os-entry-media via Storage API, then drop table/bucket.
 * Usage: node scripts/apply-r16-os-entry-abandon-zero.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const MIGRATION_FILE = "20270409130000_r16_os_entry_abandon_zero.sql";
const VERSION = "20270409130000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";
const BUCKET = "os-entry-media";

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

async function emptyBucket(sb) {
  const { data: buckets, error: listBucketErr } = await sb.storage.listBuckets();
  if (listBucketErr) throw new Error(`listBuckets: ${listBucketErr.message}`);
  if (!(buckets || []).some((b) => b.id === BUCKET || b.name === BUCKET)) {
    console.log(JSON.stringify({ bucket: BUCKET, status: "already_absent" }));
    return;
  }

  async function walk(prefix) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    const paths = [];
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) {
        paths.push(...(await walk(path)));
      } else {
        paths.push(path);
      }
    }
    return paths;
  }

  const all = await walk("");
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const { error } = await sb.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(`remove: ${error.message}`);
  }
  console.log(JSON.stringify({ bucket: BUCKET, removedObjects: all.length }));
}

loadEnvLocal();
const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!pass) throw new Error("SUPABASE_DB_PASSWORD missing");
if (!url || !service) throw new Error("supabase env missing");
if (!url.includes(EXPECTED_HOST_FRAGMENT)) throw new Error("refusing non-production project");

const sb = createClient(url, service, { auth: { persistSession: false } });
await emptyBucket(sb);

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = `postgres.${EXPECTED_HOST_FRAGMENT}`;
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };
const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);

const existing = psql(
  [...connArgs, "-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`],
  env
);
if (existing === VERSION) {
  console.log(JSON.stringify({ alreadyRecorded: true, version: VERSION }));
} else {
  psql([...connArgs, "-f", sqlPath], env);
  psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', 'r16_os_entry_abandon_zero')
       ON CONFLICT DO NOTHING`,
    ],
    env
  );
}

const check = psql(
  [
    ...connArgs,
    "-At",
    "-c",
    `SELECT
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='os_entry_screen_config'
       ) THEN 'TABLE_LIVE' ELSE 'TABLE_ZERO' END
       || '|' ||
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='os-entry-media')
         THEN 'BUCKET_LIVE' ELSE 'BUCKET_ZERO' END
       || '|' ||
       COALESCE((SELECT count(*)::text FROM storage.objects WHERE bucket_id='os-entry-media'), '0')
       || '|' ||
       CASE WHEN EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
       ) THEN 'MIG_RECORDED' ELSE 'MIG_MISSING' END`,
  ],
  env
);

console.log(JSON.stringify({ version: VERSION, check }, null, 2));
if (
  !check.includes("TABLE_ZERO") ||
  !check.includes("BUCKET_ZERO") ||
  !check.includes("|0|") ||
  !check.includes("MIG_RECORDED")
) {
  throw new Error(`R16 abandon ZERO check FAILED: ${check}`);
}
console.log("R16 DB/STORAGE ZERO PASS");
