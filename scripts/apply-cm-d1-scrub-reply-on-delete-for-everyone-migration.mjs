/**
 * Apply ONLY 20270624120000_cm_d1_scrub_reply_on_delete_for_everyone to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-cm-d1-scrub-reply-on-delete-for-everyone-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20270624120000_cm_d1_scrub_reply_on_delete_for_everyone.sql";
const VERSION = "20270624120000";
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
    "cm_scrub_reply_previews_on_delete_for_everyone",
    "SECURITY DEFINER",
    "SET search_path = public",
    "AFTER UPDATE OF deleted_for_everyone_at",
    "삭제된 메시지입니다",
    "REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM PUBLIC",
    "REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM anon",
    "REVOKE ALL ON FUNCTION public.cm_scrub_reply_previews_on_delete_for_everyone() FROM authenticated",
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
       VALUES ('${VERSION}', 'cm_d1_scrub_reply_on_delete_for_everyone')
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
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='cm_scrub_reply_previews_on_delete_for_everyone'
           AND p.prosecdef AND COALESCE(pg_catalog.array_to_string(p.proconfig,','),'') LIKE '%search_path=public%'
       ) THEN 'FN_OK' ELSE 'FN_BAD' END
       || '|' ||
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relname='community_messenger_messages'
           AND t.tgname='cm_messages_scrub_reply_on_delete_for_everyone' AND NOT t.tgisinternal
       ) THEN 'TRG_OK' ELSE 'TRG_BAD' END
       || '|' ||
       CASE WHEN COALESCE(has_function_privilege('anon','public.cm_scrub_reply_previews_on_delete_for_everyone()','EXECUTE'), false)
              OR COALESCE(has_function_privilege('authenticated','public.cm_scrub_reply_previews_on_delete_for_everyone()','EXECUTE'), false)
            THEN 'ACL_BAD' ELSE 'ACL_OK' END
       || '|' ||
       CASE WHEN EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
       ) THEN 'MIG_OK' ELSE 'MIG_BAD' END
       || '|' ||
       left(COALESCE((
         SELECT pg_get_triggerdef(t.oid)
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relname='community_messenger_messages'
           AND t.tgname='cm_messages_scrub_reply_on_delete_for_everyone' AND NOT t.tgisinternal
         LIMIT 1
       ), ''), 180)`,
  ],
  env
);

console.log(JSON.stringify({ version: VERSION, check }, null, 2));
if (!check.startsWith("FN_OK|TRG_OK|ACL_OK|MIG_OK|")) {
  throw new Error(`D-1 LIVE VERIFY FAIL: ${check}`);
}
if (!/AFTER UPDATE/i.test(check) || !/deleted_for_everyone_at/i.test(check)) {
  throw new Error(`D-1 trigger def unexpected: ${check}`);
}
console.log("D1_DB_APPLY_PASS");
