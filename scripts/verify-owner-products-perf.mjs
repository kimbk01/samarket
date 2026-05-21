#!/usr/bin/env node
/**
 * GET owner products — 3-run warm lock + PATCH invalidate.
 * @see docs/store-owner-products-perf-lock.md
 *
 * Usage:
 *   npm run verify:owner-products-perf
 *   SAMARKET_PERF_ENV=prod_same_region npm run verify:owner-products-perf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  detectOwnerProductsPerfEnvironment,
  evaluateOwnerProductsPerfLock,
  parseOwnerProductsPerfLogs,
} from "./owner-products-perf-lock.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const STORE_ID = (process.env.OWNER_PRODUCTS_VERIFY_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec").trim();
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const TERMINALS_DIR =
  process.env.OWNER_PRODUCTS_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");
const DEV_LOG = path.join(root, ".next/dev/logs/next-development.log");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

const env = detectOwnerProductsPerfEnvironment({ baseUrl: base });

async function ownerCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  let email = "aa11@manual.local";
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("auth_login_email, email")
      .or("username.eq.aa11")
      .maybeSingle();
    const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
    if (resolved.includes("@")) email = resolved;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`login failed: ${error?.message}`);
  const userId = data.session.user.id;
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  const activeSession = String(pr?.active_session_id ?? "").trim();
  if (!activeSession) throw new Error("missing active_session_id");
  return `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}; samarket_active_session_id=${encodeURIComponent(activeSession)}`;
}

function readDevLog() {
  return fs.existsSync(DEV_LOG) ? fs.readFileSync(DEV_LOG, "utf8") : "";
}

/** Terminal stdout — fallback when dev log is unavailable. */
function readTerminalLogs() {
  let s = "";
  if (!fs.existsSync(TERMINALS_DIR)) return s;
  for (const name of fs.readdirSync(TERMINALS_DIR)) {
    if (!name.endsWith(".txt")) continue;
    try {
      s += fs.readFileSync(path.join(TERMINALS_DIR, name), "utf8");
    } catch {
      /* noop */
    }
  }
  return s;
}

function readPerfSlice(devOffset, terminalOffset) {
  const dev = readDevLog().slice(devOffset);
  const term = readTerminalLogs().slice(terminalOffset);
  return dev.length >= term.length ? dev + term : term + dev;
}

function shapeCheck(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return { ok: false, reason: "empty_products" };
  }
  const p = products[0];
  const forbidden = ["options_json", "images_json", "description_html"].filter((k) => k in p);
  return { ok: forbidden.length === 0, forbidden, sampleKeys: Object.keys(p).sort() };
}

console.log("perf_environment", env);
console.log("store_id", STORE_ID);

const devLogBefore = readDevLog().length;
const terminalLogBefore = readTerminalLogs().length;

const cookie = await ownerCookie();
const listUrl = `${base}/api/me/stores/${encodeURIComponent(STORE_ID)}/products`;

async function getProducts() {
  const t0 = performance.now();
  const res = await fetch(listUrl, { headers: { cookie, accept: "application/json" }, cache: "no-store" });
  const wall_ms = Math.round(performance.now() - t0);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, wall_ms, json };
}

const phases = ["run1_cold", "run2_warm_transitional", "run3_warm"];
const http = [];
for (let i = 0; i < 3; i++) {
  http.push(await getProducts());
  if (i < 2) await new Promise((r) => setTimeout(r, 300));
}
await new Promise((r) => setTimeout(r, 500));

let perfRows = parseOwnerProductsPerfLogs(readPerfSlice(devLogBefore, terminalLogBefore));
if (perfRows.length < 3) {
  console.error(
    "verify-owner-products-perf: expected >=3 perf rows after offset, got",
    perfRows.length,
    "(dev log:",
    readDevLog().length - devLogBefore,
    "bytes)"
  );
  process.exit(1);
}

const productId = http[0]?.json?.products?.[0]?.id;
let patchStatus = null;
if (productId) {
  const sortOrder = Number(http[0].json.products[0].sort_order) || 0;
  const patchRes = await fetch(
    `${base}/api/me/stores/${encodeURIComponent(STORE_ID)}/products/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ sort_order: sortOrder }),
    }
  );
  patchStatus = patchRes.status;
  await new Promise((r) => setTimeout(r, 200));
  http.push(await getProducts());
  await new Promise((r) => setTimeout(r, 300));
  http.push(await getProducts());
  await new Promise((r) => setTimeout(r, 500));
  perfRows = parseOwnerProductsPerfLogs(readPerfSlice(devLogBefore, terminalLogBefore));
  if (perfRows.length < 5) {
    console.error("verify-owner-products-perf: expected 5 perf rows (3 GET + invalidate + rewarm), got", perfRows.length);
    process.exit(1);
  }
  perfRows = perfRows.slice(0, 5);
}

const phaseList = [...phases];
if (productId) {
  phaseList.push("after_patch_get", "after_patch_rewarm");
}

const report = [];
let exitFail = false;

for (let i = 0; i < phaseList.length; i++) {
  const phase = phaseList[i];
  const p = perfRows[i] ?? {};
  const h = http[i];
  const verdict = evaluateOwnerProductsPerfLock(p, { phase, environment: env });
  if (verdict.kind === "fail") exitFail = true;
  if (phase === "run3_warm" && !verdict.pass) exitFail = true;
  if (phase === "after_patch_rewarm" && !verdict.pass) exitFail = true;

  report.push({
    phase,
    verdict: verdict.kind,
    codes: verdict.codes,
    http_status: h?.status,
    http_wall_ms: h?.wall_ms,
    total_ms: p.total_ms,
    auth_ms: p.auth_ms,
    auth_cache_hit: p.auth_cache_hit,
    ownership_ms: p.ownership_ms,
    ownership_cache_hit: p.ownership_cache_hit,
    products_list_cache_hit: p.products_list_cache_hit,
    products_query_ms: p.products_query_ms,
    sections_query_ms: p.sections_query_ms,
    categories_query_ms: p.categories_query_ms,
    early_return_from_cache: p.early_return_from_cache,
    actual_db_queries_count: p.actual_db_queries_count,
    cache_lookup_ms: p.cache_lookup_ms,
    payload_kb: p.payload_kb,
    product_count: p.product_count,
    options_embed: p.options_embed,
    images_embed: p.images_embed,
  });
}

const shape = http[0]?.json?.ok ? shapeCheck(http[0].json.products) : { ok: false };

console.log("\n--- owner products perf verify ---\n");
console.log(
  "| phase | verdict | total_ms | auth_hit | own_hit | list_hit | pq_ms | sec_ms | early_ret | db_q | payload_kb |"
);
console.log(
  "|-------|---------|----------|----------|---------|----------|-------|--------|-----------|------|------------|"
);
for (const r of report) {
  console.log(
    `| ${r.phase} | ${r.verdict} | ${r.total_ms ?? "-"} | ${r.auth_cache_hit ?? "-"} | ${r.ownership_cache_hit ?? "-"} | ${r.products_list_cache_hit ?? "-"} | ${r.products_query_ms ?? "-"} | ${r.sections_query_ms ?? "-"} | ${r.early_return_from_cache ?? "-"} | ${r.actual_db_queries_count ?? "-"} | ${r.payload_kb ?? "-"} |`
  );
  if (r.codes?.length) console.log(`  codes: ${r.codes.join(", ")}`);
}

console.log("\nshape", JSON.stringify(shape));
if (patchStatus != null) console.log("patch_status", patchStatus);

const run3 = report.find((r) => r.phase === "run3_warm");
const rewarm = report.find((r) => r.phase === "after_patch_rewarm");
const inv = report.find((r) => r.phase === "after_patch_get");

if (run3?.verdict === "pass") {
  console.log("\nverify-owner-products-perf: Run3 warm PASS");
} else {
  console.error("\nverify-owner-products-perf: Run3 warm FAIL", run3?.codes);
  exitFail = true;
}
if (rewarm?.verdict === "pass") {
  console.log("verify-owner-products-perf: rewarm PASS");
} else if (rewarm) {
  console.error("verify-owner-products-perf: rewarm FAIL", rewarm.codes);
  exitFail = true;
}
if (inv && inv.products_list_cache_hit === 0) {
  console.log("verify-owner-products-perf: invalidate PASS");
} else if (inv) {
  console.error("verify-owner-products-perf: invalidate FAIL");
  exitFail = true;
}

if (exitFail) process.exit(1);
console.log("verify-owner-products-perf OK");
