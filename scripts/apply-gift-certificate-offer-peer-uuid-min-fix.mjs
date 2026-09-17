#!/usr/bin/env node
/**
 * Apply ONLY 20270118120000_gift_certificate_offer_peer_uuid_min_fix via linked CLI.
 *
 *   node --env-file=.env.local scripts/apply-gift-certificate-offer-peer-uuid-min-fix.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270118120000_gift_certificate_offer_peer_uuid_min_fix.sql";
const VERSION = "20270118120000";
const OUT_DIR = resolve(process.cwd(), ".tmp/gift-final-ship-audit");

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (code.includes(bad)) throw new Error(`forbidden ${bad}`);
  }
  if (!sql.includes("CREATE OR REPLACE FUNCTION public.gift_certificate_offer")) {
    throw new Error("missing gift_certificate_offer replace");
  }
  if (sql.includes("min(p.user_id)")) {
    throw new Error("still contains min(p.user_id)");
  }
  if (!sql.includes("ORDER BY p.user_id::text")) {
    throw new Error("missing uuid-safe peer select");
  }
}

function runLinkedSqlFile(absPath, label) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", absPath], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-gift-offer-peer-fix-${process.pid}-${Date.now()}.sql`);
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
    if (parsed?.rows) return parsed.rows;
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
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const hist = parseJsonRows(
    runLinkedSqlText(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
      "history-check"
    )
  );
  const already = hist.some((r) => String(r.version || "") === VERSION);
  runLinkedSqlFile(path, MIGRATION_FILE);
  if (!already) {
    runLinkedSqlText(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${VERSION}', '${MIGRATION_FILE}')
       ON CONFLICT DO NOTHING;`,
      "record-history"
    );
  }

  const probe = parseJsonRows(
    runLinkedSqlText(
      `SELECT pg_get_functiondef('public.gift_certificate_offer(uuid,uuid,uuid,uuid,text)'::regprocedure) AS def;`,
      "verify-def"
    )
  );
  const def = String(probe[0]?.def || "");
  if (!def) throw new Error("gift_certificate_offer def missing");
  if (def.includes("min(p.user_id)") || /min\(\s*p\.user_id\s*\)/.test(def)) {
    throw new Error("live function still uses min(p.user_id)");
  }
  if (!def.includes("ORDER BY p.user_id::text")) {
    throw new Error("live function missing uuid-safe peer select");
  }

  const report = {
    appliedOrPresent: true,
    alreadyRecorded: already,
    measuredAt: new Date().toISOString(),
    liveHasMinUuid: false,
    liveHasUuidSafePeer: true,
  };
  writeFileSync(resolve(OUT_DIR, "OFFER_PEER_UUID_FIX_APPLY.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
