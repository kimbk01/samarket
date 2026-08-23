#!/usr/bin/env node
/**
 * CUT 7 — Apply discovery schema to isolated local Postgres (NOT linked Production).
 * Usage: CUT7_DATABASE_URL=postgresql://… node scripts/qa/stores-discovery-scale-cut7-apply-schema.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PSQL =
  process.env.CUT7_PSQL ||
  "/opt/homebrew/opt/postgresql@17/bin/psql";
const DATABASE_URL =
  process.env.CUT7_DATABASE_URL || "postgresql:///samarket_cut7_bench";

const FILES = [
  "scripts/qa/stores-discovery-scale-cut7-bootstrap.sql",
  "supabase/migrations/20260823150000_stores_discovery_projection_schema_cut1.sql",
  "supabase/migrations/20260823170000_stores_discovery_shadow_ranking_cut3.sql",
  "supabase/migrations/20260823180000_stores_discovery_shadow_wave_cut4.sql",
  "supabase/migrations/20260823186000_stores_discovery_shadow_wave_parity_cut6.sql",
];

function runSql(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut7-${process.pid}-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    const r = spawnSync(
      PSQL,
      [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", tmp],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    );
    if (r.status !== 0) {
      console.error(`[FAIL] ${label}`);
      console.error(r.stdout || "");
      console.error(r.stderr || "");
      process.exit(r.status || 1);
    }
    console.log(`[ok] ${label}`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function main() {
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });
  for (const f of FILES) {
    let body = readFileSync(resolve(process.cwd(), f), "utf8");
    if (f.includes("20260823186000")) {
      body =
        `DROP FUNCTION IF EXISTS public.get_store_discovery_shadow_wave(integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]);\n` +
        body;
    }
    // Local Homebrew PostGIS lives in public — no gis schema rewrite.
    runSql(`SET search_path TO public;\n${body}`, f);
  }
  // Verify CUT6 signature markers in catalog
  runSql(
    `DO $$
    DECLARE
      src text;
    BEGIN
      SELECT pg_get_functiondef(p.oid) INTO src
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_store_discovery_shadow_wave'
      LIMIT 1;
      IF src IS NULL THEN
        RAISE EXCEPTION 'wave RPC missing';
      END IF;
      IF position('out_of_range IS TRUE THEN 1 ELSE 0' IN src) = 0 THEN
        RAISE EXCEPTION 'CUT6 ORDER BY out_of_range marker missing in wave RPC';
      END IF;
      IF position('distance_applies IS TRUE' IN src) = 0 THEN
        RAISE EXCEPTION 'CUT6 distance_applies marker missing in wave RPC';
      END IF;
      IF position('WHEN v_gi NOT IN (0, 2) THEN false' IN src) > 0 THEN
        RAISE EXCEPTION 'legacy G1 out_of_range=false shortcut still present';
      END IF;
      RAISE NOTICE 'CUT6 wave RPC catalog verification PASS';
    END $$;`,
    "verify-cut6-wave-catalog"
  );
  console.log("[cut7-apply-schema] PASS");
}

main();
