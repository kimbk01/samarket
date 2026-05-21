#!/usr/bin/env node
/**
 * Bootstrap lite perf lock — 3× fresh measurement + PASS/FAIL.
 * @see docs/messenger-bootstrap-lite-performance-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  BASELINE,
  BOOTSTRAP_LITE_PERF_LOCK_RULES,
  evaluateBootstrapLitePerformanceLock,
  logFromCmBootstrapV2,
} from "./bootstrap-lite-perf-lock.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const devLogPath =
  process.env.BOOTSTRAP_DEV_TERMINAL_LOG ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals", "1.txt");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const LOGIN_IDS = [process.env.E2E_TEST_USERNAME, "aaaa", "qqqq"].filter(Boolean);

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

async function login() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  for (const loginId of LOGIN_IDS) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    return `${cookieName}=${encodeURIComponent(JSON.stringify(session))}`;
  }
  throw new Error("login failed");
}

function parseTagged(tag, after) {
  if (!fs.existsSync(devLogPath)) return [];
  const lines = fs.readFileSync(devLogPath, "utf8").split(/\r?\n/);
  const hits = [];
  for (const line of lines) {
    if (!line.includes(tag)) continue;
    const j = line.indexOf("{");
    if (j < 0) continue;
    try {
      hits.push(JSON.parse(line.slice(j)));
    } catch {
      /* */
    }
  }
  return hits.slice(after);
}

function formatFailures(failures) {
  return failures.map((f) => `${f.code}: ${f.message} (expected ${f.expected}, got ${f.actual})`).join("; ");
}

async function main() {
  const v2Before = parseTagged("[cm-bootstrap-v2]", 0).length;
  const cookie = await login();
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/api/community-messenger/bootstrap?lite=1&fresh=1`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 400));

  let v2 = parseTagged("[cm-bootstrap-v2]", v2Before);
  if (v2.length < 3) v2 = parseTagged("[cm-bootstrap-v2]", 0).slice(-3);
  const bd = parseTagged("[cm-bootstrap-breakdown]", 0).slice(-v2.length);

  const runResults = v2.map((log, i) => {
    const sample = logFromCmBootstrapV2(log, bd[i] ?? {});
    const warm = i > 0;
    const lock = evaluateBootstrapLitePerformanceLock(sample, { warm });
    return {
      run: i + 1,
      warm,
      verdict: lock.pass ? "PASS" : "FAIL",
      total_api_ms: sample.total_api_ms,
      rooms_query_ms: sample.rooms_query_ms,
      profiles_query_ms: sample.profiles_query_ms,
      rooms_fetch_path: sample.rooms_fetch_path,
      trade_enrich_ms: sample.trade_enrich_ms,
      middle_ms: sample.enrich_trade_middle_ms,
      heavy_skipped: sample.heavy_pipeline_skipped,
      friends_query_ms: sample.friends_query_ms,
      requests_query_ms: sample.requests_query_ms,
      payload_kb: sample.payload_kb,
      room_count: sample.room_count,
      failures: lock.failures,
    };
  });

  const warmRuns = runResults.filter((r) => r.warm);
  const warmPass = warmRuns.length > 0 && warmRuns.every((r) => r.verdict === "PASS");
  const contractPass = runResults.length > 0 && runResults.every((r) => {
    const s = logFromCmBootstrapV2(v2[r.run - 1], bd[r.run - 1] ?? {});
    return evaluateBootstrapLitePerformanceLock(s, { warm: false }).pass;
  });
  const overallPass = warmPass && contractPass && runResults.length >= 2;

  console.log("=== Messenger bootstrap lite perf lock ===");
  console.log(`Baseline: ${BASELINE.rooms_fetch_path} | warm rooms ${BASELINE.warm_rooms_query_ms}ms | warm total ${BASELINE.warm_total_api_ms}ms`);
  console.log(
    `Thresholds: rooms <= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmRoomsQueryMsMax}ms | profiles <= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmProfilesQueryMsMax}ms | total <= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.warmTotalApiMsMax}ms | trade <= ${BOOTSTRAP_LITE_PERF_LOCK_RULES.tradeEnrichMsMax}ms`
  );
  console.log("");
  for (const r of runResults) {
    console.log(
      `Run ${r.run} (${r.warm ? "warm" : "cold/contract"}): ${r.verdict} | total=${r.total_api_ms} rooms=${r.rooms_query_ms} profiles=${r.profiles_query_ms} path=${r.rooms_fetch_path} trade=${r.trade_enrich_ms} middle=${r.middle_ms} payload_kb=${r.payload_kb} rooms=${r.room_count}`
    );
    if (r.failures.length) console.log(`  → ${formatFailures(r.failures)}`);
  }
  console.log("");
  console.log(`Overall: ${overallPass ? "PASS" : "FAIL"}`);
  console.log(`  contract (all runs): ${contractPass ? "PASS" : "FAIL"}`);
  console.log(`  warm (run 2+):       ${warmPass ? "PASS" : "FAIL"}`);
  console.log(`Log source: ${devLogPath} (${runResults.length} entries)`);

  if (!overallPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
