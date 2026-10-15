#!/usr/bin/env node
/**
 * Apply ONLY 20270426120000_security_lints_advisor_warn_close via linked CLI.
 *
 * Canonical path:
 *   npx supabase db query --linked -f <migration.sql>
 *
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node scripts/apply-security-lints-advisor-warn-close.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270426120000_security_lints_advisor_warn_close.sql";
const VERSION = "20270426120000";

const SERVICE_ONLY = [
  "claim_notification_push_handoff",
  "cm_store_order_room_is_terminal",
];

const REALTIME_AUTH_KEEP = [
  "trade_can_access_trade_chat_room",
  "trade_can_access_post_listing_broadcast",
  "trade_can_access_integrated_chat_room",
  "group_can_access_group_chat_room",
  "support_can_access_support_case",
  "store_can_access_store_realtime",
  "store_can_access_order_delivery_realtime",
];

const INTERNAL_TOPIC = [
  "cm_realtime_topic_suffix_uuid",
  "cm_realtime_topic_first_uuid_after",
];

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
    "CREATE OR REPLACE FUNCTION",
    "SECURITY INVOKER",
  ]) {
    if (code.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "claim_notification_push_handoff",
    "cm_store_order_room_is_terminal",
    "trade_can_access_trade_chat_room",
    "FROM PUBLIC, anon, authenticated",
    "FROM anon",
    "SET search_path TO ''",
    "TO service_role",
    "TO authenticated, service_role",
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
  const tmp = resolve(
    process.cwd(),
    `.tmp-warn-close-${process.pid}-${Date.now()}.sql`
  );
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
        linkedProjectExpected: "ckdosyydvgzqwpbwuhon",
        otherMigrations: "NONE",
        authLeakedPassword: "OUT_OF_BAND_DASHBOARD_OR_MANAGEMENT_API",
      },
      null,
      2
    )
  );

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
  }

  const serviceList = SERVICE_ONLY.map((n) => `'${n}'`).join(",");
  const realtimeList = REALTIME_AUTH_KEEP.map((n) => `'${n}'`).join(",");
  const topicList = INTERNAL_TOPIC.map((n) => `'${n}'`).join(",");

  const serviceOut = runLinkedSqlText(
    `SELECT p.proname,
            has_function_privilege('anon', p.oid, 'execute') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'execute') AS auth_exec,
            has_function_privilege('service_role', p.oid, 'execute') AS service_exec
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (${serviceList});`,
    "verify-service-only"
  );
  const serviceRows = parseJsonRows(serviceOut);
  const leaks = serviceRows.filter((r) => r.anon_exec || r.auth_exec).map((r) => r.proname);
  const missingService = serviceRows.filter((r) => !r.service_exec).map((r) => r.proname);
  if (leaks.length) throw new Error(`service-only still client-executable: ${leaks.join(", ")}`);
  if (missingService.length) {
    throw new Error(`service_role EXECUTE missing: ${missingService.join(", ")}`);
  }
  if (serviceRows.length < SERVICE_ONLY.length) {
    throw new Error(`service-only count ${serviceRows.length} < ${SERVICE_ONLY.length}`);
  }

  const realtimeOut = runLinkedSqlText(
    `SELECT p.proname,
            has_function_privilege('anon', p.oid, 'execute') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'execute') AS auth_exec,
            has_function_privilege('service_role', p.oid, 'execute') AS service_exec
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (${realtimeList});`,
    "verify-realtime-helpers"
  );
  const realtimeRows = parseJsonRows(realtimeOut);
  const anonLeaks = realtimeRows.filter((r) => r.anon_exec).map((r) => r.proname);
  const missingAuth = realtimeRows.filter((r) => !r.auth_exec).map((r) => r.proname);
  const missingRtService = realtimeRows.filter((r) => !r.service_exec).map((r) => r.proname);
  if (anonLeaks.length) {
    throw new Error(`realtime helpers still anon-executable: ${anonLeaks.join(", ")}`);
  }
  if (missingAuth.length) {
    throw new Error(`realtime helpers missing authenticated EXECUTE: ${missingAuth.join(", ")}`);
  }
  if (missingRtService.length) {
    throw new Error(`realtime helpers missing service_role EXECUTE: ${missingRtService.join(", ")}`);
  }
  if (realtimeRows.length < REALTIME_AUTH_KEEP.length) {
    throw new Error(
      `realtime helper count ${realtimeRows.length} < ${REALTIME_AUTH_KEEP.length}`
    );
  }

  const topicOut = runLinkedSqlText(
    `SELECT p.proname,
            has_function_privilege('anon', p.oid, 'execute') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'execute') AS auth_exec,
            COALESCE(pg_catalog.pg_get_function_identity_arguments(p.oid), '') AS args,
            (
              SELECT option_value
              FROM pg_options_to_table(p.proconfig)
              WHERE option_name = 'search_path'
              LIMIT 1
            ) AS search_path
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'internal' AND p.proname IN (${topicList});`,
    "verify-internal-topic"
  );
  const topicRows = parseJsonRows(topicOut);
  if (topicRows.length < INTERNAL_TOPIC.length) {
    throw new Error(`internal topic count ${topicRows.length} < ${INTERNAL_TOPIC.length}`);
  }
  const topicAnon = topicRows.filter((r) => r.anon_exec).map((r) => r.proname);
  const topicNoAuth = topicRows.filter((r) => !r.auth_exec).map((r) => r.proname);
  const topicMutable = topicRows
    .filter((r) => r.search_path == null || String(r.search_path) !== "")
    .map((r) => `${r.proname}:${r.search_path ?? "<null>"}`);
  if (topicAnon.length) {
    throw new Error(`internal topic still anon-executable: ${topicAnon.join(", ")}`);
  }
  if (topicNoAuth.length) {
    throw new Error(`internal topic missing authenticated EXECUTE: ${topicNoAuth.join(", ")}`);
  }
  if (topicMutable.length) {
    throw new Error(`internal topic search_path not empty: ${topicMutable.join(", ")}`);
  }

  console.log(
    JSON.stringify(
      {
        phase: already ? "ALREADY_APPLIED" : "AFTER_SCHEMA",
        migrationApply: "PASS",
        otherMigrationsApplied: "NONE",
        proof: {
          serviceOnlyClosed: serviceRows.length,
          realtimeAnonClosedAuthKept: realtimeRows.length,
          internalTopicSearchPathPinned: topicRows.length,
          residualAuthenticatedWarnExpected: REALTIME_AUTH_KEEP,
        },
      },
      null,
      2
    )
  );
  console.log("[apply-security-lints-advisor-warn-close] ok");
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
