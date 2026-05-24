#!/usr/bin/env node
/**
 * DIBAY delivery API perf — cold + warm 3-run per endpoint.
 * node scripts/measure-dibay-api-perf-patch.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const TERMINALS_DIR =
  process.env.OWNER_DASHBOARD_TERMINALS_DIR ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

function readTerminalTail() {
  let combined = "";
  if (!fs.existsSync(TERMINALS_DIR)) return combined;
  for (const name of fs.readdirSync(TERMINALS_DIR)) {
    if (!name.endsWith(".txt")) continue;
    try {
      combined += fs.readFileSync(path.join(TERMINALS_DIR, name), "utf8");
    } catch {
      /* */
    }
  }
  return combined;
}

function extractJsonAfterTag(log, tag) {
  const blocks = [];
  const re = new RegExp(
    `\\[${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*(\\{[\\s\\S]*?\\})(?=\\n\\[|$)`,
    "g"
  );
  let m;
  while ((m = re.exec(log)) !== null) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      /* */
    }
  }
  return blocks;
}

async function login(loginId = "qqqq") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234",
  });
  if (error || !data.session) throw new Error(`login failed: ${error?.message ?? "no session"}`);
  return {
    name: `sb-${ref}-auth-token`,
    value: encodeURIComponent(
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      })
    ),
  };
}

async function findStoreSlug(headers) {
  const browse = await fetch(`${baseUrl}/api/stores/browse?limit=1`, {
    headers: { ...headers, "cache-control": "no-store" },
  });
  const j = await browse.json().catch(() => null);
  const slug = j?.stores?.[0]?.slug ?? j?.items?.[0]?.slug ?? null;
  if (slug) return slug;
  const home = await fetch(`${baseUrl}/api/stores/home-feed?limit=1`, {
    headers: { ...headers, "cache-control": "no-store" },
  });
  const hj = await home.json().catch(() => null);
  return hj?.stores?.[0]?.slug ?? hj?.items?.[0]?.slug ?? "test-store";
}

async function timedFetch(url, headers) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { ...headers, "cache-control": "no-store" } });
  const body = await res.text();
  return {
    client_ms: Date.now() - t0,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body_len: body.length,
  };
}

function avg(nums) {
  const v = nums.filter((n) => Number.isFinite(n));
  return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : -1;
}

async function runEndpoint(label, url, headers, runs = 3, bypassFirst = true) {
  const rows = [];
  if (bypassFirst) {
    await timedFetch(`${url}${url.includes("?") ? "&" : "?"}bypassCache=1`, headers);
    await new Promise((r) => setTimeout(r, 150));
  }
  for (let i = 1; i <= runs; i++) {
    rows.push({ run: i, ...(await timedFetch(url, headers)) });
    await new Promise((r) => setTimeout(r, 120));
  }
  return { label, url, rows };
}

async function main() {
  const cookie = await login(process.env.E2E_TEST_USERNAME || "qqqq");
  const headers = { cookie: `${cookie.name}=${cookie.value}` };
  const slug = process.env.DIBAY_PERF_STORE_SLUG || (await findStoreSlug(headers));
  const logBefore = readTerminalTail();

  console.log("\n=== DIBAY API perf patch measure ===");
  console.log("base:", baseUrl);
  console.log("store slug:", slug);

  const profile = await runEndpoint("profile", `${baseUrl}/api/me/profile`, headers);
  const summary = await runEndpoint(
    "summary",
    `${baseUrl}/api/stores/${encodeURIComponent(slug)}/summary`,
    headers
  );
  const menus = await runEndpoint(
    "menus",
    `${baseUrl}/api/stores/${encodeURIComponent(slug)}/menus`,
    headers
  );

  await new Promise((r) => setTimeout(r, 400));
  const logAfter = readTerminalTail();
  const newLog = logAfter.slice(Math.max(0, logAfter.length - (logAfter.length - logBefore.length + 50000)));

  const profilePerf = extractJsonAfterTag(newLog, "dev-api-perf").filter((b) =>
    String(b.route || b.path || "").includes("/api/me/profile")
  );
  const routePerf = extractJsonAfterTag(newLog, "route-perf");
  const summaryPerf = extractJsonAfterTag(newLog, "store-summary-perf");
  const menusPerf = extractJsonAfterTag(newLog, "delivery-menus-api-breakdown");

  console.log("\n--- client wall (ms) ---");
  for (const ep of [profile, summary, menus]) {
    console.log(
      ep.label,
      ep.rows.map((r) => `${r.run}:${r.client_ms}`).join(" "),
      "avg=",
      avg(ep.rows.map((r) => r.client_ms))
    );
  }

  console.log("\n--- server logs (last blocks) ---");
  console.log("profile dev-api-perf:", JSON.stringify(profilePerf.slice(-3), null, 0));
  console.log("profile route-perf:", JSON.stringify(routePerf.filter((r) => r.route === "/api/me/profile").slice(-3)));
  console.log("summary:", JSON.stringify(summaryPerf.slice(-3)));
  console.log("menus:", JSON.stringify(menusPerf.slice(-3)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
