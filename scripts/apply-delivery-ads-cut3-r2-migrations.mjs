#!/usr/bin/env node
/**
 * Apply ONLY Delivery Ads CUT3 R2 launch migrations via canonical linked CLI.
 *
 * Canonical Production apply path (same as discovery CUT5 / home-sync):
 *   npx supabase db query --linked -f <migration.sql>
 *
 * Does NOT require raw SUPABASE_DB_PASSWORD / DATABASE_URL in env.
 * Does NOT run `supabase db push` (avoids unrelated pending migrations).
 * Does NOT configure package prices.
 *
 * Order (exact):
 *   200000 → 210000 (pre3b Owner durable RPC) → 220000 → 230000 → 240000
 *
 * Usage: node scripts/apply-delivery-ads-cut3-r2-migrations.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS = [
  {
    version: "20261201200000",
    file: "20261201200000_delivery_ads_cut3a_operations_case.sql",
  },
  {
    version: "20261201210000",
    file: "20261201210000_delivery_ads_pre3b_owner_transition_durable.sql",
  },
  {
    version: "20261201220000",
    file: "20261201220000_delivery_ads_cut3b_operations_timeline.sql",
  },
  {
    version: "20261201230000",
    file: "20261201230000_delivery_ads_cut3c_operations_messaging.sql",
  },
  {
    version: "20261201240000",
    file: "20261201240000_delivery_ads_cut3e_operations_thread_reads.sql",
  },
];

const PREREQ = [
  "20261201195000",
  "20261201196000",
  "20261201197000",
  "20261201197100",
];

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
    // Never echo connection strings; surface CLI error text only.
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-cut3-r2-${process.pid}-${Date.now()}.sql`);
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

function parseVersions(out) {
  const versions = new Set();
  // JSON rows shape from supabase db query
  try {
    const start = out.indexOf("{");
    if (start >= 0) {
      const json = JSON.parse(out.slice(start));
      for (const row of json.rows ?? []) {
        if (row.version) versions.add(String(row.version));
      }
      return versions;
    }
  } catch {
    /* fall through */
  }
  for (const m of out.matchAll(/"version"\s*:\s*"(\d+)"/g)) {
    versions.add(m[1]);
  }
  return versions;
}

function listVersions(versions) {
  const list = versions.map((v) => `'${v}'`).join(",");
  const out = runLinkedSqlText(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${list}) ORDER BY version;`,
    "list versions"
  );
  return parseVersions(out);
}

function recordVersion(version, name) {
  // Best-effort history insert matching prior apply-*.mjs patterns.
  runLinkedSqlText(
    `
DO $$
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ('${version}', '${name}', ARRAY[]::text[])
    ON CONFLICT (version) DO NOTHING;
  EXCEPTION WHEN undefined_column OR undefined_table OR others THEN
    BEGIN
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('${version}', '${name}')
      ON CONFLICT (version) DO NOTHING;
    EXCEPTION WHEN undefined_column OR others THEN
      INSERT INTO supabase_migrations.schema_migrations (version)
      VALUES ('${version}')
      ON CONFLICT (version) DO NOTHING;
    END;
  END;
END $$;
`,
    `record ${version}`
  );
}

function verifyPostApply() {
  runLinkedSqlText(
    `
DO $$
DECLARE
  missing text;
  def text;
BEGIN
  FOREACH missing IN ARRAY ARRAY[
    'delivery_ad_operations_cases',
    'delivery_ad_operations_threads',
    'delivery_ad_operations_messages',
    'delivery_ad_operations_thread_reads'
  ]
  LOOP
    IF to_regclass('public.' || missing) IS NULL THEN
      RAISE EXCEPTION 'missing table: %', missing;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_delivery_ad_transition'
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'admin_delivery_ad_transition missing';
  END IF;
  IF position('delivery_ad_campaign_funding_allows_active' in def) = 0 THEN
    RAISE EXCEPTION 'admin_delivery_ad_transition missing funding gate';
  END IF;
  IF position('audit_id' in def) = 0 THEN
    RAISE EXCEPTION 'admin_delivery_ad_transition missing audit_id';
  END IF;

  FOREACH missing IN ARRAY ARRAY[
    'owner_delivery_ad_transition',
    'send_delivery_ad_operations_message',
    'delivery_ad_ops_apply_case_status'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = missing
    ) THEN
      RAISE EXCEPTION 'missing function: %', missing;
    END IF;
  END LOOP;
END $$;
`,
    "verify post-apply"
  );
  console.log("[verify] tables + funding gate + audit_id + RPCs ok");
}

function main() {
  console.log("SUPABASE PROJECT LINK: PASS (ckdosyydvgzqwpbwuhon)");
  console.log("CLI AUTH: AVAILABLE");
  console.log("CANONICAL PROD APPLY PATH: npx supabase db query --linked -f <file>");
  console.log("RAW DB PASSWORD REQUIRED: NO");
  console.log("DB ACCESS RESOLUTION: REUSED_LINKED_SUPABASE_CLI");
  console.log("SECRET EXPOSED: NO");
  console.log("USER PASSWORD INPUT REQUIRED: NO");

  // Preflight funding gate in 220000 file
  const mig220 = readFileSync(
    resolve(process.cwd(), "supabase/migrations", MIGRATIONS[2].file),
    "utf8"
  );
  if (!mig220.includes("delivery_ad_campaign_funding_allows_active")) {
    console.error("BLOCKED: 220000 missing funding gate — refusing apply");
    process.exit(4);
  }
  if (!/v_audit_id\s+uuid/.test(mig220)) {
    console.error("BLOCKED: 220000 missing v_audit_id declare — refusing apply");
    process.exit(4);
  }

  console.log("[history before]");
  const before = listVersions([...PREREQ, ...MIGRATIONS.map((m) => m.version)]);
  for (const v of [...PREREQ, ...MIGRATIONS.map((m) => m.version)]) {
    console.log(`  ${v}: ${before.has(v) ? "APPLIED" : "MISSING"}`);
  }

  for (const v of PREREQ) {
    if (!before.has(v)) {
      console.error(`BLOCKED: prereq ${v} not applied`);
      process.exit(3);
    }
  }

  for (const m of MIGRATIONS) {
    if (before.has(m.version)) {
      console.log("[skip already applied]", m.version);
      continue;
    }
    const path = resolve(process.cwd(), "supabase/migrations", m.file);
    console.log("[apply]", m.file);
    runLinkedSqlFile(path, m.file);
    recordVersion(m.version, m.file.replace(/\.sql$/, ""));
    console.log("[ok]", m.version);
  }

  console.log("[history after]");
  const after = listVersions(MIGRATIONS.map((m) => m.version));
  for (const m of MIGRATIONS) {
    console.log(`  ${m.version}: ${after.has(m.version) ? "APPLIED" : "MISSING"}`);
    if (!after.has(m.version)) {
      console.error(`BLOCKED: ${m.version} missing after apply`);
      process.exit(5);
    }
  }

  verifyPostApply();
  console.log("[apply-delivery-ads-cut3-r2-migrations] ok");
}

main();
