#!/usr/bin/env node
/**
 * Community D-Point cutover: Production pg precheck → apply → post-integrity.
 * Does not DELETE/UPDATE ledger or member balances.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const PROD_REF = "ckdosyydvgzqwpbwuhon";
const VERSION = "20261027120000";
const MIGRATION = "supabase/migrations/20261027120000_community_dpoint_financial_writer.sql";
const OUT = resolve(process.cwd(), ".qa-logs/community-dpoint-cutover-20260811");

function loadEnvLocal() {
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
}

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    `postgresql://postgres.${PROD_REF}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = `postgres.${PROD_REF}`;
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

function assertProduction(cs) {
  if (!cs.includes(PROD_REF)) {
    throw new Error(`REFUSING: connection string is not Production ${PROD_REF}`);
  }
}

async function snapshot(client) {
  const { rows: counts } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.point_ledger) AS ledger_all,
      (SELECT COUNT(*)::int FROM public.point_ledger WHERE related_type = 'community_reward') AS reward,
      (SELECT COUNT(*)::int FROM public.point_ledger WHERE related_type = 'community_reclaim') AS reclaim,
      (SELECT COUNT(*)::int FROM public.point_reward_executions) AS executions,
      (SELECT COALESCE(SUM(amount), 0)::bigint FROM public.point_ledger) AS ledger_sum,
      (SELECT COALESCE(SUM(points), 0)::bigint FROM public.profiles) AS profiles_points_sum,
      (SELECT COUNT(*)::int FROM public.profiles WHERE points < 0) AS neg_profiles,
      (SELECT COUNT(*)::int FROM public.point_reclaim_policies) AS reclaim_policies
  `);
  const { rows: fingerprint } = await client.query(`
    SELECT md5(string_agg(id::text || ':' || amount::text, ',' ORDER BY id)) AS ledger_fp
      FROM public.point_ledger
     WHERE related_type IN ('community_reward', 'community_reclaim')
  `);
  const { rows: execFp } = await client.query(`
    SELECT md5(string_agg(id::text || ':' || status || ':' || final_point::text, ',' ORDER BY id)) AS exec_fp
      FROM public.point_reward_executions
  `);
  return { ...counts[0], ledger_fp: fingerprint[0]?.ledger_fp ?? null, exec_fp: execFp[0]?.exec_fp ?? null };
}

async function precheck(client) {
  const { rows: types } = await client.query(`
    SELECT related_type, COUNT(*)::int AS n
      FROM public.point_ledger
     GROUP BY related_type
     ORDER BY related_type
  `);
  const { rows: indexes } = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'point_ledger'
     ORDER BY indexname
  `);
  const { rows: execUniq } = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'point_reward_executions'
       AND indexdef ILIKE '%execution_key%'
  `);
  const { rows: cols } = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'board_point_policies'
     ORDER BY ordinal_position
  `);
  const { rows: dups } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM (
         SELECT user_id, related_id FROM public.point_ledger
          WHERE related_type = 'community_reward'
          GROUP BY user_id, related_id HAVING COUNT(*) > 1
       ) x) AS reward_dups,
      (SELECT COUNT(*) FROM (
         SELECT user_id, related_id FROM public.point_ledger
          WHERE related_type = 'community_reclaim'
          GROUP BY user_id, related_id HAVING COUNT(*) > 1
       ) x) AS reclaim_dups
  `);
  const { rows: nullRelated } = await client.query(`
    SELECT COUNT(*)::int AS n
      FROM public.point_ledger
     WHERE related_type IN ('community_reward', 'community_reclaim')
       AND related_id IS NULL
  `);
  return { types, indexes, execUniq, boardCols: cols.map((c) => c.column_name), dups: dups[0], nullRelated: nullRelated[0].n };
}

async function postProof(client) {
  const { rows: fns } = await client.query(`
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'apply_community_point_reward',
         'apply_community_point_reclaim',
         'project_user_point_balance_from_ledger'
       )
     ORDER BY p.proname
  `);
  const { rows: grants } = await client.query(`
    SELECT routine_name, grantee, privilege_type
      FROM information_schema.routine_privileges
     WHERE specific_schema = 'public'
       AND routine_name IN ('apply_community_point_reward', 'apply_community_point_reclaim')
     ORDER BY routine_name, grantee
  `);
  const { rows: idx } = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN (
         'uq_point_ledger_community_reward_source',
         'uq_point_ledger_community_reclaim_source'
       )
  `);
  const { rows: execCols } = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'point_reward_executions'
       AND column_name IN ('policy_snapshot', 'related_ledger_id')
  `);
  const { rows: policyCols } = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'board_point_policies'
       AND column_name IN (
         'inherit_global', 'policy_layer', 'daily_reward_post_cap',
         'daily_reward_comment_cap', 'min_reward_post_chars',
         'min_reward_comment_chars', 'policy_version'
       )
  `);
  const { rows: layers } = await client.query(`
    SELECT board_key, policy_layer, inherit_global
      FROM public.board_point_policies
     WHERE board_key IN ('general', 'qna')
     ORDER BY board_key
  `);
  const { rows: reclaim } = await client.query(`
    SELECT id, target_type, trigger_type, is_active
      FROM public.point_reclaim_policies
     WHERE id IN ('prp-4','prp-5','prp-6','prp-7','prp-8')
     ORDER BY id
  `);
  const { rows: schemaMig } = await client.query(`
    SELECT to_regclass('supabase_migrations.schema_migrations') AS t
  `);
  let migrationRow = null;
  if (schemaMig[0]?.t) {
    const { rows } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION],
    );
    migrationRow = rows[0] ?? null;
  }
  return { fns, grants, idx, execCols, policyCols, layers, reclaim, schemaMig: schemaMig[0]?.t, migrationRow };
}

async function recordMigrationVersion(client) {
  const { rows } = await client.query(`SELECT to_regclass('supabase_migrations.schema_migrations') AS t`);
  if (!rows[0]?.t) {
    console.log("schema_migrations table absent — skip version insert");
    return { recorded: false };
  }
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  `);
  const names = cols.map((c) => c.column_name);
  if (names.includes("version") && names.includes("name")) {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [VERSION, "community_dpoint_financial_writer"],
    );
  } else {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version)
       VALUES ($1)
       ON CONFLICT DO NOTHING`,
      [VERSION],
    );
  }
  return { recorded: true };
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required");
    process.exit(1);
  }
  assertProduction(cs);
  try {
    mkdirSync(OUT, { recursive: true });
  } catch {
    /* qa-logs may be ignored in some sandboxes */
  }

  const host = (() => {
    try {
      const u = new URL(cs.replace(/^postgresql:\/\//, "http://"));
      return u.hostname;
    } catch {
      return "(parse-fail)";
    }
  })();

  console.log("DATABASE TARGET:", host);
  console.log("PROJECT REF:", PROD_REF);
  console.log("AUDIT READ-ONLY:", apply ? "NO — APPLY" : "YES — PRECHECK");
  console.log("MODE:", apply ? "APPLY" : "PRECHECK");

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const chk = await precheck(client);
    const before = await snapshot(client);
    console.log("\n--- RELATED_TYPE COUNTS ---");
    console.log(JSON.stringify(chk.types, null, 2));
    console.log("\n--- POINT_LEDGER INDEXES ---");
    console.log(JSON.stringify(chk.indexes, null, 2));
    console.log("\n--- EXECUTION_KEY INDEXES ---");
    console.log(JSON.stringify(chk.execUniq, null, 2));
    console.log("\n--- BOARD POLICY COLS ---");
    console.log(chk.boardCols.join(", "));
    console.log("\n--- DUP GATE ---");
    console.log(JSON.stringify(chk.dups));
    console.log("NULL related_id:", chk.nullRelated);
    console.log("\n--- SNAPSHOT BEFORE ---");
    console.log(JSON.stringify(before, null, 2));

    const otherTypes = chk.types
      .map((t) => t.related_type)
      .filter((t) => t !== "community_reward" && t !== "community_reclaim");
    console.log("\nUNIQUE SCOPE: community_reward + community_reclaim ONLY (partial indexes)");
    console.log("OTHER related_types UNLOCKED:", otherTypes.join(", ") || "(none yet)");
    console.log("execution_key UNIQUE already:", chk.execUniq.length > 0 ? "YES" : "NO");

    if (Number(chk.dups.reward_dups) > 0 || Number(chk.dups.reclaim_dups) > 0) {
      console.error("MIGRATION BLOCKED — duplicate groups in DB");
      process.exit(2);
    }
    if (chk.nullRelated > 0) {
      console.error("MIGRATION BLOCKED — NULL related_id on community ledger");
      process.exit(2);
    }

    try {
      writeFileSync(
        resolve(OUT, "precheck.json"),
        JSON.stringify({ host, PROD_REF, otherTypes, chk, before }, null, 2),
      );
    } catch {
      /* ignore */
    }

    if (!apply) {
      console.log("\nMIGRATION SAFETY: SAFE (precheck only — not applied)");
      return;
    }

    const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
    console.log("\n[apply]", MIGRATION);
    await client.query(sql);
    console.log("[ok] SQL applied");
    const recorded = await recordMigrationVersion(client);
    console.log("[schema_migrations]", JSON.stringify(recorded));

    const after = await snapshot(client);
    const proof = await postProof(client);
    try {
      writeFileSync(
        resolve(OUT, "post-apply.json"),
        JSON.stringify({ before, after, proof, recorded }, null, 2),
      );
    } catch {
      /* ignore */
    }

    const unchanged =
      Number(before.ledger_all) === Number(after.ledger_all) &&
      Number(before.reward) === Number(after.reward) &&
      Number(before.reclaim) === Number(after.reclaim) &&
      Number(before.executions) === Number(after.executions) &&
      String(before.ledger_sum) === String(after.ledger_sum) &&
      String(before.profiles_points_sum) === String(after.profiles_points_sum) &&
      before.ledger_fp === after.ledger_fp &&
      before.exec_fp === after.exec_fp;

    console.log("\n--- SNAPSHOT AFTER ---");
    console.log(JSON.stringify(after, null, 2));
    console.log("\nPOST-MIGRATION DATA UNCHANGED:", unchanged ? "YES" : "NO");
    console.log("RPC reward:", proof.fns.some((f) => f.proname === "apply_community_point_reward"));
    console.log("RPC reclaim:", proof.fns.some((f) => f.proname === "apply_community_point_reclaim"));
    console.log("UNIQUE indexes:", proof.idx.map((i) => i.indexname));
    console.log("exec cols:", proof.execCols.map((c) => c.column_name));
    console.log("policy cols:", proof.policyCols.map((c) => c.column_name));
    console.log("layers:", JSON.stringify(proof.layers));
    console.log("reclaim seeds:", JSON.stringify(proof.reclaim));
    console.log("schema_migrations row:", JSON.stringify(proof.migrationRow));
    console.log("grants:", JSON.stringify(proof.grants));

    if (!unchanged) {
      console.error("POST-MIGRATION FAIL — counts/balances changed");
      process.exit(3);
    }
    if (!proof.fns.some((f) => f.proname === "apply_community_point_reward")) {
      console.error("RPC apply_community_point_reward missing");
      process.exit(3);
    }
    if (!proof.fns.some((f) => f.proname === "apply_community_point_reclaim")) {
      console.error("RPC apply_community_point_reclaim missing");
      process.exit(3);
    }
    if (proof.idx.length < 2) {
      console.error("UNIQUE indexes missing");
      process.exit(3);
    }
    console.log("\nMIGRATION APPLIED: PASS");
    console.log("MIGRATION VERSION:", VERSION);
    console.log("POST-MIGRATION PASS");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
