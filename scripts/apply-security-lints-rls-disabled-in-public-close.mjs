#!/usr/bin/env node
/**
 * Apply ONLY 20270120120000_security_lints_rls_disabled_in_public_close
 * via linked CLI.
 *
 * Canonical path:
 *   npx supabase db query --linked -f <migration.sql>
 *
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage:
 *   node scripts/apply-security-lints-rls-disabled-in-public-close.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270120120000_security_lints_rls_disabled_in_public_close.sql";
const VERSION = "20270120120000";
const TABLES = ["store_delivery_service_areas", "store_order_stock_restore_claims"];

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of [
    "DROP TABLE",
    "DROP COLUMN",
    "TRUNCATE",
    "DELETE FROM",
    "CREATE POLICY",
    "ALTER POLICY",
  ]) {
    if (code.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "store_delivery_service_areas",
    "store_order_stock_restore_claims",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE",
    "FROM PUBLIC, anon, authenticated",
    "GRANT ALL ON TABLE",
    "TO service_role",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

function runLinkedSqlFile(absPath, label) {
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", absPath],
    {
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    }
  );
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-rls-disabled-close-${process.pid}-${Date.now()}.sql`);
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

function parseJsonRows(out) {
  const text = String(out || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  } catch {
    /* fall through */
  }
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* ignore */
    }
  }
  return [];
}

function tableStateSql(table) {
  return `
SELECT
  '${table}' AS table_name,
  c.relrowsecurity AS rls,
  c.relforcerowsecurity AS force_rls,
  (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
  has_table_privilege('anon', 'public.${table}', 'SELECT') AS anon_sel,
  has_table_privilege('anon', 'public.${table}', 'INSERT') AS anon_ins,
  has_table_privilege('anon', 'public.${table}', 'UPDATE') AS anon_upd,
  has_table_privilege('anon', 'public.${table}', 'DELETE') AS anon_del,
  has_table_privilege('authenticated', 'public.${table}', 'SELECT') AS auth_sel,
  has_table_privilege('authenticated', 'public.${table}', 'INSERT') AS auth_ins,
  has_table_privilege('authenticated', 'public.${table}', 'UPDATE') AS auth_upd,
  has_table_privilege('authenticated', 'public.${table}', 'DELETE') AS auth_del,
  has_table_privilege('service_role', 'public.${table}', 'SELECT') AS service_sel,
  has_table_privilege('service_role', 'public.${table}', 'INSERT') AS service_ins,
  has_table_privilege('service_role', 'public.${table}', 'UPDATE') AS service_upd,
  has_table_privilege('service_role', 'public.${table}', 'DELETE') AS service_del
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '${table}';
`;
}

function isTrue(v) {
  return v === true || v === "t" || v === "true";
}

function main() {
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  console.log(
    JSON.stringify(
      {
        phase: "PLAN",
        approvedMigration: MIGRATION_FILE,
        version: VERSION,
        tables: TABLES,
        otherMigrations: "NONE",
      },
      null,
      2
    )
  );

  const preRows = [];
  for (const table of TABLES) {
    preRows.push(...parseJsonRows(runLinkedSqlText(tableStateSql(table), `pre-${table}`)));
  }
  console.log(JSON.stringify({ phase: "PRE", rows: preRows }, null, 2));

  const histOut = runLinkedSqlText(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
    "history-check"
  );
  const hist = parseJsonRows(histOut);
  const already = hist.some((r) => String(r.version || r.VERSION || "") === VERSION);

  if (!already) {
    runLinkedSqlFile(path, MIGRATION_FILE);
    runLinkedSqlText(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', '${MIGRATION_FILE}')
       ON CONFLICT DO NOTHING;`,
      "record-history"
    );
  } else {
    console.log(JSON.stringify({ phase: "SKIP_APPLY", reason: "already_recorded" }, null, 2));
    runLinkedSqlFile(path, `${MIGRATION_FILE}:idempotent-reapply`);
  }

  const postRows = [];
  for (const table of TABLES) {
    postRows.push(...parseJsonRows(runLinkedSqlText(tableStateSql(table), `post-${table}`)));
  }
  console.log(JSON.stringify({ phase: "POST", rows: postRows }, null, 2));

  const advisorOut = runLinkedSqlText(
    `
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND NOT c.relrowsecurity
ORDER BY c.relname;
`,
    "advisor-0013"
  );
  const advisorHits = parseJsonRows(advisorOut);
  console.log(JSON.stringify({ phase: "ADVISOR_0013", hits: advisorHits }, null, 2));

  const fail = [];
  for (const post of postRows) {
    const t = String(post.table_name || "");
    if (!isTrue(post.rls)) fail.push(`${t}:rls`);
    if (!isTrue(post.force_rls)) fail.push(`${t}:force_rls`);
    if (Number(post.policies) !== 0) fail.push(`${t}:policies`);
    for (const k of [
      "anon_sel",
      "anon_ins",
      "anon_upd",
      "anon_del",
      "auth_sel",
      "auth_ins",
      "auth_upd",
      "auth_del",
    ]) {
      if (isTrue(post[k])) fail.push(`${t}:${k}`);
    }
    for (const k of ["service_sel", "service_ins", "service_upd", "service_del"]) {
      if (!isTrue(post[k])) fail.push(`${t}:${k}`);
    }
  }
  if (advisorHits.length !== 0) fail.push("advisor_rls_disabled_nonzero");

  const recorded = parseJsonRows(
    runLinkedSqlText(
      `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
      "history-verify"
    )
  );
  if (!recorded.some((r) => String(r.version) === VERSION)) fail.push("migration_not_recorded");

  if (fail.length) {
    console.error(JSON.stringify({ phase: "VERIFY_FAIL", fail }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        phase: "PASS",
        version: VERSION,
        tables: TABLES,
        advisor_rls_disabled_in_public: 0,
        migration_recorded: true,
      },
      null,
      2
    )
  );
}

main();
