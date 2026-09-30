/**
 * Apply R16 os-entry table + storage bucket to Production.
 * Usage: node scripts/apply-os-entry-screen-config.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MIGRATION_FILE = "20270409120000_os_entry_screen_config.sql";
const VERSION = "20270409120000";
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

function main() {
  loadEnvLocal();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) throw new Error("SUPABASE_DB_PASSWORD missing");

  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  if (!sql.includes("os_entry_screen_config") || !sql.includes("os-entry-media")) {
    throw new Error("migration content unexpected");
  }
  if (/\br15_startup|startup.presentation|intro_/i.test(sql)) {
    throw new Error("os-entry migration must not touch R15/Intro");
  }

  const host = "aws-1-ap-south-1.pooler.supabase.com";
  const user = `postgres.${EXPECTED_HOST_FRAGMENT}`;
  const connArgs = ["-h", host, "-p", "5432", "-d", "postgres", "-U", user, "-v", "ON_ERROR_STOP=1"];
  const env = { PGPASSWORD: pass };

  const existing = psql(
    [
      ...connArgs,
      "-At",
      "-c",
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}'`,
    ],
    env
  );
  if (existing === VERSION) {
    console.log(JSON.stringify({ alreadyRecorded: true, version: VERSION }));
  } else {
    console.log("[apply] os-entry migration…");
    psql([...connArgs, "-f", sqlPath], env);
    psql(
      [
        ...connArgs,
        "-At",
        "-c",
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ('${VERSION}', 'os_entry_screen_config')
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
         ) THEN 'TABLE_OK' ELSE 'TABLE_MISSING' END
         || '|' ||
         CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='os-entry-media')
           THEN 'BUCKET_OK' ELSE 'BUCKET_MISSING' END
         || '|' ||
         COALESCE((SELECT count(*)::text FROM public.os_entry_screen_config), '0')
         || '|' ||
         CASE WHEN EXISTS (
           SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
         ) THEN 'MIG_RECORDED' ELSE 'MIG_MISSING' END`,
    ],
    env
  );

  console.log(JSON.stringify({ ok: true, version: VERSION, check }, null, 2));
  if (
    !check.includes("TABLE_OK") ||
    !check.includes("BUCKET_OK") ||
    !check.includes("MIG_RECORDED")
  ) {
    throw new Error(`os-entry apply check FAILED: ${check}`);
  }
}

main();
