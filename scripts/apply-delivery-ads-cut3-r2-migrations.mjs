#!/usr/bin/env node
/**
 * Apply ONLY Delivery Ads CUT3 R2 launch migrations (200000→240000 incl. pre3b 210000).
 * Does NOT run `supabase db push`. Does NOT apply unrelated migrations.
 * Does NOT configure package prices.
 *
 * Usage: node --env-file=.env.local scripts/apply-delivery-ads-cut3-r2-migrations.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

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

const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";

function loadEnvLocal() {
  try {
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
  } catch {
    /* ignore */
  }
}

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function listVersions(client, versions) {
  const { rows } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = ANY($1::text[])`,
    [versions]
  );
  return new Set(rows.map((r) => String(r.version)));
}

async function recordVersion(client, version, name) {
  try {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, $3::text[])
       ON CONFLICT (version) DO NOTHING`,
      [version, name, []]
    );
    return;
  } catch {
    /* try narrower shapes */
  }
  try {
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [version, name]
    );
    return;
  } catch {
    /* fall through */
  }
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version)
     VALUES ($1)
     ON CONFLICT (version) DO NOTHING`,
    [version]
  );
}

async function verify(client) {
  const tables = [
    "delivery_ad_operations_cases",
    "delivery_ad_operations_threads",
    "delivery_ad_operations_messages",
    "delivery_ad_operations_thread_reads",
  ];
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (!rows.length) throw new Error(`missing table: ${table}`);
    console.log("[verify] table ok:", table);
  }

  const { rows: funding } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'admin_delivery_ad_transition'
     LIMIT 1`
  );
  if (!funding.length) throw new Error("admin_delivery_ad_transition missing");
  const def = String(funding[0].def);
  if (!def.includes("delivery_ad_campaign_funding_allows_active")) {
    throw new Error("admin_delivery_ad_transition missing funding gate after apply");
  }
  if (!def.includes("audit_id")) {
    throw new Error("admin_delivery_ad_transition missing audit_id after apply");
  }
  console.log("[verify] admin_delivery_ad_transition funding+audit_id ok");

  for (const fn of [
    "owner_delivery_ad_transition",
    "send_delivery_ad_operations_message",
    "delivery_ad_ops_apply_case_status",
  ]) {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1`,
      [fn]
    );
    if (!rows.length) throw new Error(`missing function: ${fn}`);
    console.log("[verify] function ok:", fn);
  }
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(2);
  }
  if (!cs.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error("refusing non-approved DB host");
    process.exit(2);
  }

  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("[history before]");
  const before = await listVersions(client, [...PREREQ, ...MIGRATIONS.map((m) => m.version)]);
  for (const v of [...PREREQ, ...MIGRATIONS.map((m) => m.version)]) {
    console.log(`  ${v}: ${before.has(v) ? "APPLIED" : "MISSING"}`);
  }

  for (const v of PREREQ) {
    if (!before.has(v)) {
      console.error(`BLOCKED: prereq ${v} not applied`);
      await client.end();
      process.exit(3);
    }
  }

  for (const m of MIGRATIONS) {
    if (before.has(m.version)) {
      console.log("[skip already applied]", m.version);
      continue;
    }
    const path = resolve(process.cwd(), "supabase/migrations", m.file);
    const sql = readFileSync(path, "utf8");
    if (m.version === "20261201220000") {
      if (!sql.includes("delivery_ad_campaign_funding_allows_active")) {
        console.error("BLOCKED: 220000 missing funding gate — refusing apply");
        await client.end();
        process.exit(4);
      }
      if (!sql.includes("v_audit_id uuid")) {
        console.error("BLOCKED: 220000 missing v_audit_id declare — refusing apply");
        await client.end();
        process.exit(4);
      }
    }
    console.log("[apply]", m.file);
    await client.query(sql);
    await recordVersion(client, m.version, m.file.replace(/\.sql$/, ""));
    console.log("[ok]", m.version);
  }

  console.log("[history after]");
  const after = await listVersions(client, MIGRATIONS.map((m) => m.version));
  for (const m of MIGRATIONS) {
    console.log(`  ${m.version}: ${after.has(m.version) ? "APPLIED" : "MISSING"}`);
  }

  await verify(client);
  await client.end();
  console.log("[apply-delivery-ads-cut3-r2-migrations] ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
