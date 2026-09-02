/**
 * Shared helpers for Support CUT 3 runtime close scripts.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

export const MIGRATION_FILE = "20261202170000_support_cases_ssot.sql";
export const MIGRATION_VERSION = "20261202170000";
export const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";
export const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(
  /\/$/,
  ""
);

export const FIXTURE = {
  memberA: process.env.SUPPORT_CUT3_MEMBER_A || "wwww@manual.local",
  memberB: process.env.SUPPORT_CUT3_MEMBER_B || "qqqq@manual.local",
  owner: process.env.SUPPORT_CUT3_OWNER || "sadads@adsasdsa.com",
  admin: process.env.SUPPORT_CUT3_ADMIN || "aaaa@manual.local",
};

export const SUPPORT_TABLES = [
  "support_cases",
  "support_messages",
  "support_sessions",
  "support_case_events",
];

export function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  }
}

export function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  // Single encode only — URL.password setter must NOT be used with encodeURIComponent
  // or the password becomes double-encoded and auth fails.
  const user = "postgres.ckdosyydvgzqwpbwuhon";
  const host =
    process.env.SUPABASE_POOLER_HOST?.trim() || "aws-1-ap-south-1.pooler.supabase.com";
  const port = process.env.SUPABASE_POOLER_PORT?.trim() || "5432";
  return `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/postgres`;
}

export function assertHost(conn) {
  const host = new URL(conn.replace(/^postgresql:/, "http:")).hostname;
  if (!host.includes(EXPECTED_HOST_FRAGMENT) && !conn.includes(EXPECTED_HOST_FRAGMENT)) {
    throw new Error(`WRONG_DB_HOST:${host}`);
  }
}

export function readMigrationSql() {
  return readFileSync(resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE), "utf8");
}

export function assertMigrationSqlSafe(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) throw new Error(`destructive_sql:${bad}`);
  }
  for (const legacy of ["member_admin_note_threads", "delivery_ad_operations_cases"]) {
    if (new RegExp(`ALTER\\s+TABLE\\s+public\\.${legacy}`, "i").test(sql)) {
      throw new Error(`legacy_alter:${legacy}`);
    }
  }
  for (const must of [
    "CREATE TABLE IF NOT EXISTS public.support_cases",
    "support_cases_member_no_store",
    "CREATE TABLE IF NOT EXISTS public.support_messages",
    "CREATE TABLE IF NOT EXISTS public.support_sessions",
    "CREATE TABLE IF NOT EXISTS public.support_case_events",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing:${must}`);
  }
}

export async function pgClient() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) throw new Error("missing_db_credentials");
  assertHost(conn);
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

export function sbService() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("missing_supabase_service_role");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] || "";
  if (ref !== EXPECTED_HOST_FRAGMENT) throw new Error(`wrong_supabase_ref:${ref}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

export function sbAnon() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

export function passwords() {
  return [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
}

export async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

export function cookieHeader(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const token = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  return `sb-${ref}-auth-token=${token}`;
}

export async function apiJson(session, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      Cookie: cookieHeader(session),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { raw: await res.text().catch(() => "") };
  }
  return { status: res.status, json };
}

export function memberContext(overrides = {}) {
  return {
    enabled: true,
    audience: "MEMBER",
    category: "COUPON",
    sourceSurface: "mypage_coupons",
    ...overrides,
  };
}

export function ownerContext(storeId, overrides = {}) {
  return {
    enabled: true,
    audience: "OWNER",
    category: "CASH_COIN",
    sourceSurface: "owner_finance",
    storeId,
    ...overrides,
  };
}

export async function migrationAlreadyApplied(client) {
  const { rows } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
    [MIGRATION_VERSION]
  );
  return rows.length > 0;
}

export async function tableExists(client, table) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  return rows[0]?.reg != null;
}

/** Fallback when DATABASE_URL / SUPABASE_DB_PASSWORD are absent — REST table probe only. */
export async function tableExistsViaRest(table) {
  const sb = sbService();
  const { error } = await sb.from(table).select("id").limit(1);
  if (!error) return true;
  const code = String(error.code || "");
  const msg = String(error.message || "");
  if (code === "42P01" || /does not exist/i.test(msg)) return false;
  // Permission / RLS errors imply table exists.
  if (code === "42501" || /permission denied/i.test(msg)) return true;
  return false;
}

export async function migrationAppliedViaRest() {
  // No public REST for schema_migrations — infer from support_cases existence + sample query.
  return tableExistsViaRest("support_cases");
}
