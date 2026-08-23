#!/usr/bin/env node
/**
 * CUT 5 — Apply discovery scale migrations via supabase db query --linked.
 * Sets search_path to include gis (PostGIS schema on this project) before each file.
 * Does NOT cut over HOME/BROWSE ranking.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "supabase/migrations/20260823145000_stores_discovery_postgis_gis_bridge_cut5.sql",
  "supabase/migrations/20260823150000_stores_discovery_projection_schema_cut1.sql",
  "supabase/migrations/20260823160000_stores_discovery_projection_maintainers_cut2.sql",
  "supabase/migrations/20260823170000_stores_discovery_shadow_ranking_cut3.sql",
  "supabase/migrations/20260823180000_stores_discovery_shadow_wave_cut4.sql",
  "supabase/migrations/20260823185000_stores_discovery_gis_function_search_path_cut5.sql",
];

function runLinkedSql(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut5-${process.pid}-${Date.now()}.sql`);
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
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function qualifyPostgisForGisSchema(sql) {
  return sql
    .replace(/SET search_path = public\b/g, "SET search_path = public, gis, extensions")
    .replace(/SET search_path TO public\b/g, "SET search_path TO public, gis, extensions")
    .replace(/::geography\b/g, "::gis.geography")
    .replace(/\bgeography\s*\(/g, "gis.geography(");
}

function main() {
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });
  for (const f of FILES) {
    const body = readFileSync(resolve(process.cwd(), f), "utf8");
    const wrapped = `SET search_path TO public, gis, extensions;\n${qualifyPostgisForGisSchema(body)}`;
    runLinkedSql(wrapped, f);
  }
  console.log("[apply-stores-discovery-scale-cut5] PASS");
}

main();
