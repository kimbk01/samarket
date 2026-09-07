/**
 * Apply ONLY 20261210120000_cm_call_terminal_writer_ssot_cut1 to Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-call-terminal-writer-ssot-cut1-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261210120000_cm_call_terminal_writer_ssot_cut1.sql";
const VERSION = "20261210120000";
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

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "cleanup_stale_community_messenger_call_sessions",
    "DO NOT mutate",
    "caller_last_heartbeat_at < stale_cutoff",
    "callee_last_heartbeat_at < stale_cutoff",
    "cleanup_stale_cm_call_sessions",
    "unschedule",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing required CUT1 marker: ${must}`);
  }
  if (/SET\s+status\s*=\s*'ended'/i.test(sql) || /ended_reason\s*=\s*'heartbeat_timeout'/i.test(sql)) {
    throw new Error("CUT1 migration must not mutate terminal fields");
  }
}

async function verifyCut1(client) {
  const { rows: fnRows } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'cleanup_stale_community_messenger_call_sessions'`,
  );
  if (!fnRows.length) throw new Error("function missing after apply");
  const def = String(fnRows[0].def || "");
  if (/SET\s+status\s*=\s*'ended'/i.test(def) || /ended_reason\s*=\s*'heartbeat_timeout'/i.test(def)) {
    throw new Error("LIVE FAIL: function still mutates terminal fields");
  }
  if (!def.includes("caller_last_heartbeat_at") || !def.includes("callee_last_heartbeat_at")) {
    throw new Error("LIVE FAIL: both-stale detect predicate missing");
  }

  let cronJobs = null;
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM cron.job WHERE jobname = 'cleanup_stale_cm_call_sessions'`,
    );
    cronJobs = rows[0]?.n ?? 0;
  } catch {
    cronJobs = null; // pg_cron absent
  }

  const { rows: hist } = await client.query(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [VERSION],
  );

  return { cronJobs, history: hist };
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("FAIL: DATABASE_URL or SUPABASE_DB_PASSWORD required");
    process.exit(1);
  }
  if (!cs.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error("FAIL: connection host is not approved Production project fragment");
    process.exit(1);
  }

  const sqlPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(sqlPath, "utf8");
  assertApprovedSql(sql);

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const before = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION],
    );
    if (before.rows.length) {
      console.log(`[cut1] already in schema_migrations (${VERSION}) — re-verify only`);
    } else {
      console.log(`[cut1] applying ${MIGRATION_FILE}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [VERSION, MIGRATION_FILE.replace(/\.sql$/, "")],
      );
      console.log("[cut1] applied + recorded in schema_migrations");
    }

    const live = await verifyCut1(client);
    console.log("[cut1] LIVE VERIFY:", JSON.stringify(live));
    if (live.cronJobs != null && live.cronJobs > 0) {
      console.error("FAIL: mutating pg_cron job still scheduled");
      process.exit(1);
    }
    console.log("PASS: CUT1 terminal writer SSOT live on Production DB");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
