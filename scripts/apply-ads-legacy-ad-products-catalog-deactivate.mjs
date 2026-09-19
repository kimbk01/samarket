#!/usr/bin/env node
/**
 * CUT D — apply ONLY 20270119120000_ads_legacy_ad_products_catalog_deactivate.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 *   node --env-file=.env.local scripts/apply-ads-legacy-ad-products-catalog-deactivate.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270119120000_ads_legacy_ad_products_catalog_deactivate.sql";
const OUT_DIR = resolve(process.cwd(), ".tmp/ads-legacy-catalog-deactivate");

function assertApprovedSql(sql) {
  const code = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (code.includes(bad)) throw new Error(`forbidden ${bad}`);
  }
  if (!code.includes("UPDATE PUBLIC.AD_PRODUCTS")) throw new Error("missing UPDATE ad_products");
  if (!code.includes("IS_ACTIVE = FALSE")) throw new Error("missing is_active=false");
  if (!code.includes("HIGHLIGHT") || !code.includes("TOP_FIXED") || !code.includes("MID_INSERT")) {
    throw new Error("missing target ad_types");
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
  const tmp = resolve(process.cwd(), `.tmp-ads-legacy-cat-${process.pid}-${Date.now()}.sql`);
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

mkdirSync(OUT_DIR, { recursive: true });
const abs = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(abs, "utf8");
assertApprovedSql(sql);

console.log(`[apply] ${MIGRATION_FILE}`);
runLinkedSqlFile(abs, "deactivate_legacy_ad_products");

const verifyOut = runLinkedSqlText(
  `SELECT ad_type,
          count(*)::int AS n,
          count(*) FILTER (WHERE is_active)::int AS active_n
   FROM public.ad_products
   WHERE ad_type IN ('highlight','top_fixed','mid_insert')
   GROUP BY ad_type
   ORDER BY ad_type;`,
  "verify_inactive"
);
const rows = parseJsonRows(verifyOut);
writeFileSync(resolve(OUT_DIR, "verify.json"), JSON.stringify(rows, null, 2), "utf8");
console.log("[verify]", JSON.stringify(rows));

const stillActive = rows.filter((r) => Number(r.active_n) > 0);
if (stillActive.length) {
  console.error("[FAIL] still active:", stillActive);
  process.exit(1);
}

console.log("[PASS] legacy ad_products catalog deactivated");
