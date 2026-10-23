/**
 * Apply ONLY 20261201120000_cm_mutual_friend_request_atomic to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-cm-mutual-friend-request-atomic-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20261201120000_cm_mutual_friend_request_atomic.sql";
const VERSION = "20261201120000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";

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
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "CREATE OR REPLACE FUNCTION public.cm_send_friend_request",
    "CREATE OR REPLACE FUNCTION public.cm_accept_friend_request",
    "CREATE OR REPLACE FUNCTION public.cm_reject_friend_request",
    "CREATE OR REPLACE FUNCTION public.cm_cancel_friend_request",
    "FOR UPDATE",
    "INSERT INTO public.user_social_relations",
    "SECURITY DEFINER",
    "SET search_path = public",
    "REVOKE ALL ON FUNCTION public.cm_accept_friend_request(uuid, uuid) FROM anon, authenticated",
    "GRANT EXECUTE ON FUNCTION public.cm_accept_friend_request(uuid, uuid) TO service_role",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required marker: ${must}`);
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
  console.error("BLOCKED: SUPABASE_DB_PASSWORD missing");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(sqlPath, "utf8");
assertApprovedSql(sql);

const host = "aws-1-ap-south-1.pooler.supabase.com";
const user = `postgres.${EXPECTED_HOST_FRAGMENT}`;
const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
const env = { PGPASSWORD: pass };

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
       VALUES ('${VERSION}', 'cm_mutual_friend_request_atomic')
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
       CASE WHEN (
         SELECT count(*) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public'
           AND p.proname IN ('cm_send_friend_request','cm_accept_friend_request','cm_reject_friend_request','cm_cancel_friend_request')
           AND p.prosecdef
       ) = 4 THEN 'FN_OK' ELSE 'FN_BAD' END
       || '|' ||
       CASE WHEN COALESCE(has_function_privilege('anon','public.cm_accept_friend_request(uuid,uuid)','EXECUTE'), false)
              OR COALESCE(has_function_privilege('authenticated','public.cm_accept_friend_request(uuid,uuid)','EXECUTE'), false)
            THEN 'ACL_BAD' ELSE 'ACL_OK' END
       || '|' ||
       CASE WHEN COALESCE(has_function_privilege('service_role','public.cm_accept_friend_request(uuid,uuid)','EXECUTE'), false)
            THEN 'SR_OK' ELSE 'SR_BAD' END
       || '|' ||
       CASE WHEN EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
       ) THEN 'MIG_OK' ELSE 'MIG_BAD' END`,
  ],
  env
);

console.log(JSON.stringify({ version: VERSION, check }, null, 2));
if (check !== "FN_OK|ACL_OK|SR_OK|MIG_OK") {
  throw new Error(`BUNDLE6 LIVE VERIFY FAIL: ${check}`);
}
console.log("BUNDLE6_DB_APPLY_PASS");
