#!/usr/bin/env node
/**
 * Upsert projected National LGU data into Supabase (service role).
 * Idempotent. Does NOT modify posts rows / trade_lgu_id values.
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Run only after schema migration 20261107120000_trade_national_lgu_ssot.sql
 *
 *   node scripts/trade/import-psgc-trade-national-lgu-to-db.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DATA = join(ROOT, "data/trade-national-lgu");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — dry-run only");
    const proj = JSON.parse(readFileSync(join(DATA, "lgu-projection.json"), "utf8"));
    console.log(JSON.stringify({ dry_run: true, selectable: proj.lgu.length }, null, 2));
    process.exit(0);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const projection = JSON.parse(readFileSync(join(DATA, "lgu-projection.json"), "utf8"));
  const aliasDoc = JSON.parse(readFileSync(join(DATA, "legacy-alias-map.json"), "utf8"));
  const localDoc = JSON.parse(readFileSync(join(DATA, "local-area-map.json"), "utf8"));
  const version = projection.dataset_version;

  const lguRows = projection.lgu.map((r) => ({
    canonical_id: r.canonical_id,
    lgu_type: r.lgu_type,
    display_name: r.display_name,
    region_code: r.region_code,
    region_name: r.region_name,
    province_code: r.province_code,
    province_name: r.province_name,
    is_active: r.is_active,
    dataset_version: r.dataset_version,
    superseded_by: r.superseded_by,
    updated_at: new Date().toISOString(),
  }));

  const chunk = 200;
  for (let i = 0; i < lguRows.length; i += chunk) {
    const slice = lguRows.slice(i, i + chunk);
    const { error } = await sb.from("trade_national_lgu").upsert(slice, {
      onConflict: "canonical_id",
    });
    if (error) throw error;
  }

  // Replace aliases for this dataset version (idempotent full sync of kinds)
  const { error: delAliasErr } = await sb
    .from("trade_national_lgu_alias")
    .delete()
    .eq("dataset_version", version);
  if (delAliasErr) throw delAliasErr;

  const aliasRows = aliasDoc.aliases.map((a) => ({
    alias: a.alias,
    alias_raw: a.alias_raw,
    canonical_id: a.canonical_id,
    kind: a.kind,
    dataset_version: version,
  }));
  for (let i = 0; i < aliasRows.length; i += chunk) {
    const slice = aliasRows.slice(i, i + chunk);
    const { error } = await sb.from("trade_national_lgu_alias").upsert(slice, {
      onConflict: "alias,canonical_id,kind",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  const localRows = localDoc.rows.map((r) => ({
    region_id: r.region_id,
    city_id: r.city_id,
    legacy_lgu_alias: r.legacy_lgu_alias,
    canonical_id: r.canonical_id,
    dataset_version: version,
  }));
  for (let i = 0; i < localRows.length; i += chunk) {
    const slice = localRows.slice(i, i + chunk);
    const { error } = await sb.from("trade_local_area_lgu_map").upsert(slice, {
      onConflict: "region_id,city_id",
    });
    if (error) throw error;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dataset_version: version,
        lgu: lguRows.length,
        aliases: aliasRows.length,
        local_area: localRows.length,
        posts_rewritten: false,
        trade_lgu_id_backfill: false,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
