#!/usr/bin/env node
/**
 * CUT 6 wave parity SQL — apply via supabase db query --linked.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const FILE = "supabase/migrations/20260823186000_stores_discovery_shadow_wave_parity_cut6.sql";

function runLinkedSql(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut6-${process.pid}-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    const r = spawnSync(
      "npx",
      ["supabase", "db", "query", "--linked", "-f", tmp],
      { encoding: "utf8", cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 }
    );
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    if (r.status !== 0) {
      console.error(`[FAIL] ${label}`);
      console.error(out);
      process.exit(r.status || 1);
    }
    console.log(`[ok] ${label}`);
    return out;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const body = readFileSync(resolve(process.cwd(), FILE), "utf8");
  runLinkedSql(`SET search_path TO public, gis, extensions;\n${body}`, FILE);
  const verify = `
SELECT
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%out_of_range IS TRUE THEN 1 ELSE 0%' THEN 'PASS' ELSE 'FAIL' END AS cut6_oor,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%distance_applies IS TRUE%' THEN 'PASS' ELSE 'FAIL' END AS cut6_da,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%WHEN v_gi NOT IN (0, 2) THEN false%' THEN 'FAIL' ELSE 'PASS' END AS no_legacy_g1
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_store_discovery_shadow_wave' LIMIT 1;
`;
  const out = runLinkedSql(verify, "verify-cut6-markers");
  if (!/cut6_oor["\s:]+PASS/.test(out) || !/cut6_da["\s:]+PASS/.test(out)) {
    console.error("[FAIL] CUT6 markers not confirmed");
    process.exit(1);
  }
  console.log("[apply-stores-discovery-scale-cut6] PASS");
}

main();
