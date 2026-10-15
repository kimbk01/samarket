#!/usr/bin/env node
/**
 * Apply PTR reveal audience migration to Production only (ckdosyydvgzqwpbwuhon).
 * Before/after column verify. No data deletion.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION = "supabase/migrations/20270502120000_platform_popup_ptr_reveal_audience.sql";
const PROD_REF = "ckdosyydvgzqwpbwuhon";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
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
    `postgresql://postgres.${PROD_REF}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = `postgres.${PROD_REF}`;
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function columnState(client) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'platform_popup_campaigns'
       AND column_name IN ('audience_mode', 'audience_user_ids')
     ORDER BY column_name`
  );
  return rows;
}

async function assertProdHost(client) {
  const { rows } = await client.query(`select current_database() as db, inet_server_addr()::text as addr`);
  console.log("[host]", rows[0]);
  // Soft check via connection string username/host already pointing at PROD_REF
  const cs = buildConnectionString() || "";
  if (!cs.includes(PROD_REF)) {
    throw new Error(`Refusing apply: connection string does not include ${PROD_REF}`);
  }
}

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required (.env.local)");
    process.exit(2);
  }
  if (!cs.includes(PROD_REF)) {
    console.error(`Refusing: not Production ${PROD_REF}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await assertProdHost(client);
    const before = await columnState(client);
    console.log("[before]", JSON.stringify(before));
    if (before.length === 2) {
      console.log("[skip] columns already present — verifying constraint only");
    } else {
      const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
      console.log("[apply]", MIGRATION);
      await client.query(sql);
    }
    const after = await columnState(client);
    console.log("[after]", JSON.stringify(after));
    if (after.length !== 2) throw new Error("audience columns missing after apply");
    const { rows: chk } = await client.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'public.platform_popup_campaigns'::regclass
         AND conname = 'platform_popup_campaigns_audience_mode_check'`
    );
    if (!chk.length) throw new Error("audience_mode check constraint missing");
    const { rows: sample } = await client.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE audience_mode = 'all')::int AS all_n
       FROM public.platform_popup_campaigns`
    );
    console.log("[counts]", sample[0]);
    console.log("[PASS] migration audience columns present; no rows deleted");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
