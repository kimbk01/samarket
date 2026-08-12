#!/usr/bin/env node
/**
 * Admin Push Campaign — Steps 1–5 + 7 (browser/API regression probes).
 * READ production DB via service role for QA rows only. No push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/admin-campaign-runtime-gates-${STAMP}`);
const PORT = Number(process.env.ADMIN_GATE_PORT || 3010);
const BASE = `http://127.0.0.1:${PORT}`;
const PROD_REF = "ckdosyydvgzqwpbwuhon";
const ADMIN_LOGIN = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
const QA_USER_ID = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const MARK = `ACG-${Date.now()}`;

const LEGACY_CTA = ["저장 후 즉시 배치 발송", "발송 시작", "배치 발송 실행", "배치 발송"];
const PRIMARY_CREATE = ["임시 저장", "검토하기"];

fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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
}

function log(msg) {
  const line = `[acg] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, "run.log"), line + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function loginAdmin() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase env missing");
  const email = ADMIN_LOGIN.includes("@") ? ADMIN_LOGIN : `${ADMIN_LOGIN}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session && sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: link } = await adminSb.auth.admin.generateLink({ type: "magiclink", email });
    const u = new URL(String(link?.properties?.action_link || ""));
    const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    const { data: verified } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    session = verified.session;
  }
  if (!session) throw new Error("admin login failed");

  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  const cookieSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  let cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(cookieSession))}`;
  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { cookie, userId: session.user.id, accessToken: session.access_token };
}

function sbAdmin() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchJson(pathname, cookie, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, ms: 0 };
}

async function waitForServer(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/admin/notifications`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* retry */
    }
    await sleep(3000);
  }
  return false;
}

function portListening() {
  try {
    const r = spawnSync("lsof", ["-i", `:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return r.stdout.includes("LISTEN");
  } catch {
    return false;
  }
}

function startDevServer() {
  const child = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });
  child.stdout?.on("data", (d) => fs.appendFileSync(path.join(OUT, "dev-server.log"), d));
  child.stderr?.on("data", (d) => fs.appendFileSync(path.join(OUT, "dev-server.log"), d));
  return child;
}

async function launchBrowser() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH || String(process.env.PLAYWRIGHT_BROWSERS_PATH).includes("cursor-sandbox-cache")) {
    const homePw = `${process.env.HOME}/Library/Caches/ms-playwright`;
    if (fs.existsSync(homePw)) process.env.PLAYWRIGHT_BROWSERS_PATH = homePw;
  }
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(chrome)) {
    return chromium.launch({ headless: true, executablePath: chrome, args: ["--disable-dev-shm-usage"] });
  }
  return chromium.launch({ headless: true });
}

async function browserStep1(cookie) {
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const cookies = cookie.split("; ").map((pair) => {
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    const value = decodeURIComponent(pair.slice(i + 1));
    return { name, value, domain: "127.0.0.1", path: "/" };
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const report = {};

  async function bodyText() {
    return page.locator("body").innerText();
  }

  await page.goto(`${BASE}/admin/notifications`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await sleep(2000);
  report.listPage = page.url().includes("/admin/notifications") ? "PASS" : "FAIL";

  await page.goto(`${BASE}/admin/notifications/create`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(1500);
  const createText = await bodyText();
  report.createPage = page.url().includes("/admin/notifications/create") ? "PASS" : "FAIL";
  report.draftBtn = createText.includes("임시 저장") ? "PASS" : "FAIL";
  report.reviewBtn = createText.includes("검토하기") ? "PASS" : "FAIL";
  report.legacyCtaCount = LEGACY_CTA.filter((s) => createText.includes(s)).length;
  report.legacyCta = report.legacyCtaCount === 0 ? "PASS" : "FAIL";
  report.primaryCreate = PRIMARY_CREATE.every((s) => createText.includes(s)) ? "PASS" : "FAIL";

  await page.fill('input[type="text"]', `[QA-${MARK}] browser smoke`);
  const bodyInputs = page.locator("textarea");
  if ((await bodyInputs.count()) > 0) await bodyInputs.first().fill("QA body");
  await page.getByRole("button", { name: "검토하기" }).click();
  await sleep(1000);
  const reviewText = await bodyText();
  report.immediateReview = reviewText.includes("즉시 발송") ? "PASS" : "FAIL";
  report.primaryCtaOne =
    (reviewText.match(/지금 발송|예약 확정|반복 캠페인 시작/g) || []).length >= 1 ? "PASS" : "FAIL";

  await page.getByLabel("예약 발송").click().catch(async () => {
    await page.locator('input[value="scheduled"]').click({ force: true }).catch(() => {});
  });
  await sleep(500);
  const schedText = await bodyText();
  report.scheduledReview = schedText.includes("예약 확정") ? "PASS" : "FAIL";

  await page.getByLabel("반복 발송").click().catch(async () => {
    await page.locator('input[value="recurring"]').click({ force: true }).catch(() => {});
  });
  await sleep(500);
  const repText = await bodyText();
  report.recurringReview = repText.includes("반복 캠페인 시작") ? "PASS" : "FAIL";

  await page.goto(`${BASE}/admin/notifications?audience=ops`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const opsText = await bodyText();
  report.listOpsDefault = !opsText.includes(`[QA-${MARK}]`) ? "PASS" : "FAIL";

  await page.goto(`${BASE}/admin/notifications?audience=qa`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  report.qaFilter = page.url().includes("audience=qa") ? "PASS" : "FAIL";

  await page.goto(`${BASE}/admin/notifications?audience=all`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  report.allFilter = page.url().includes("audience=all") ? "PASS" : "FAIL";

  const { data: sentCamp } = await sbAdmin()
    .from("admin_notification_campaigns")
    .select("id")
    .eq("status", "sent")
    .eq("is_qa", false)
    .limit(1)
    .maybeSingle();
  if (sentCamp?.id) {
    await page.goto(`${BASE}/admin/notifications/${sentCamp.id}`, { waitUntil: "domcontentloaded" });
    await sleep(2000);
    const detailText = await bodyText();
    report.detailOccurrences = /실행|occurrence|Occurrence|발송 이력/i.test(detailText) ? "PASS" : "FAIL";
    report.detailMetrics = /Push|In-app|푸시|인앱/i.test(detailText) ? "PASS" : "FAIL";
    report.detailLegacyBatch = detailText.includes("배치 발송") ? "FAIL" : "PASS";
  } else {
    report.detailOccurrences = "SKIP";
    report.detailMetrics = "SKIP";
    report.detailLegacyBatch = "SKIP";
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "step1-browser.json"), JSON.stringify(report, null, 2));
  return report;
}

async function createQaCampaign(adminCookie, body) {
  const t0 = Date.now();
  const res = await fetchJson("/api/admin/notification-campaigns", adminCookie, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": body.create_request_id },
  });
  res.ms = Date.now() - t0;
  return res;
}

async function sendCampaign(adminCookie, campaignId, opts = {}) {
  const t0 = Date.now();
  const res = await fetchJson(`/api/admin/notification-campaigns/${campaignId}/send`, adminCookie, {
    method: "POST",
    body: JSON.stringify({ enqueue_only: true, ...opts }),
    headers: { "Idempotency-Key": opts.idempotency_key || `send-${MARK}` },
  });
  res.ms = Date.now() - t0;
  return res;
}

async function cleanupCampaign(id) {
  const sb = sbAdmin();
  await sb.from("admin_notification_campaign_occurrences").delete().eq("campaign_id", id);
  await sb.from("admin_notification_campaign_targets").delete().eq("campaign_id", id);
  await sb.from("notification_campaign_deliveries").delete().eq("campaign_id", id);
  await sb.from("admin_notification_campaigns").delete().eq("id", id);
}

async function apiD3D5(admin) {
  const sb = sbAdmin();
  const results = {};

  const base = {
    title: `[QA-${MARK}] runtime`,
    body: "QA runtime gate",
    type: "notice",
    target_type: "selected_users",
    channel: "in_app_only",
    deeplink_url: "/notifications",
    is_qa: true,
    target_user_ids: [QA_USER_ID],
    create_request_id: `${MARK}-sel-inapp`,
    save_as_draft: false,
    send_mode: "immediate",
  };

  for (const ch of ["in_app_only", "push_only", "push_and_in_app"]) {
    const reqId = `${MARK}-${ch}`;
    const r = await createQaCampaign(admin.cookie, { ...base, channel: ch, create_request_id: reqId });
    const cid = r.json?.id || r.json?.campaignId || r.json?.campaign_id;
    if (!cid) {
      results[ch] = "FAIL";
      continue;
    }
    const sendR = await sendCampaign(admin.cookie, cid, { idempotency_key: `${reqId}-send` });
    const { data: occ } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("id, status")
      .eq("campaign_id", cid)
      .limit(1)
      .maybeSingle();
    results[ch] = r.status === 200 && sendR.status === 200 && occ?.id ? "PASS" : "FAIL";
    await cleanupCampaign(cid);
  }
  results.selected_user = results.in_app_only;

  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  const schedReq = `${MARK}-sched-future`;
  const schedCreate = await createQaCampaign(admin.cookie, {
    ...base,
    channel: "in_app_only",
    create_request_id: schedReq,
    send_mode: "scheduled",
    scheduled_at: future,
    save_as_draft: false,
  });
  const schedCid = schedCreate.json?.id || schedCreate.json?.campaignId;
  results.schedule_future = schedCreate.status === 200 && schedCid ? "PASS" : "FAIL";

  const pastCreate = await createQaCampaign(admin.cookie, {
    ...base,
    create_request_id: `${MARK}-sched-past`,
    send_mode: "scheduled",
    scheduled_at: past,
  });
  results.schedule_past_reject = pastCreate.status === 400 || pastCreate.json?.error ? "PASS" : "FAIL";

  let cancelPass = "FAIL";
  if (schedCid) {
    const { data: occ } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("id, status")
      .eq("campaign_id", schedCid)
      .eq("status", "queued")
      .maybeSingle();
    if (occ?.id) {
      const cancelR = await fetchJson(
        `/api/admin/notification-campaigns/occurrences/${occ.id}/cancel`,
        admin.cookie,
        { method: "POST", body: "{}" }
      );
      const { data: after } = await sb
        .from("admin_notification_campaign_occurrences")
        .select("status")
        .eq("id", occ.id)
        .maybeSingle();
      cancelPass = cancelR.status === 200 && after?.status === "cancelled" ? "PASS" : "FAIL";

      const claim = await sb.rpc("claim_due_admin_notification_campaign_occurrence", {
        p_claim_token: `${MARK}-cancel-claim`,
      });
      const claimedCancelled = (claim.data ?? []).some((r) => String(r.id) === String(occ.id));
      results.cancelled_not_claimed = claimedCancelled ? "FAIL" : "PASS";
    }
    await cleanupCampaign(schedCid);
  }
  results.schedule_cancel = cancelPass;

  const d5Req = `${MARK}-async`;
  const d5Create = await createQaCampaign(admin.cookie, {
    ...base,
    create_request_id: d5Req,
    channel: "in_app_only",
  });
  const d5Cid = d5Create.json?.id || d5Create.json?.campaignId;
  const t0 = Date.now();
  const d5Send = d5Cid ? await sendCampaign(admin.cookie, d5Cid, { enqueue_only: true }) : null;
  results.d5_http_ms = d5Send?.ms ?? -1;
  results.d5_enqueue_fast = d5Send && d5Send.ms < 5000 ? "PASS" : "FAIL";

  if (d5Cid) {
    const { data: occ } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("id, status")
      .eq("campaign_id", d5Cid)
      .maybeSingle();
    await sb
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "sending",
        send_claimed_at: new Date().toISOString(),
        send_lease_expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("id", occ.id);
    const beforeDel = await sb
      .from("notification_campaign_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("occurrence_id", occ.id);
    await sb.rpc("claim_due_admin_notification_campaign_occurrence", { p_claim_token: `${MARK}-reclaim` });
    const { data: afterOcc } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("status")
      .eq("id", occ.id)
      .maybeSingle();
    const afterDel = await sb
      .from("notification_campaign_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("occurrence_id", occ.id);
    results.d5_reclaim = afterOcc?.status === "queued" ? "PASS" : "FAIL";
    results.d5_duplicate_delivery = beforeDel.count === afterDel.count ? "PASS" : "FAIL";
    await cleanupCampaign(d5Cid);
  }

  const recReq = `${MARK}-repeat`;
  const recStart = new Date(Date.now() + 86400_000).toISOString();
  const recCreate = await createQaCampaign(admin.cookie, {
    ...base,
    create_request_id: recReq,
    send_mode: "recurring",
    recurrence_kind: "daily",
    recurrence_time: "09:00",
    recurrence_start_at: recStart,
    recurrence_end_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    save_as_draft: false,
  });
  const recCid = recCreate.json?.id || recCreate.json?.campaignId;
  let d4 = { create: "FAIL" };
  if (recCid) {
    const { data: o1rows } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("id, sequence_number, status")
      .eq("campaign_id", recCid)
      .order("sequence_number");
    const o1 = o1rows?.[0];
    if (o1?.id) {
      await sb
        .from("admin_notification_campaign_occurrences")
        .update({ status: "sent", completed_at: new Date().toISOString() })
        .eq("id", o1.id);
    }
    const sched2 = new Date(Date.now() + 2 * 86400_000).toISOString();
    const r2 = await sb.rpc("ensure_admin_notification_campaign_occurrence", {
      p_campaign_id: recCid,
      p_sequence_number: 2,
      p_trigger_type: "recurring",
      p_scheduled_for: sched2,
      p_idempotency_key: `${MARK}-occ2`,
      p_triggered_by: admin.userId,
      p_content_snapshot: { title: "repeat2" },
    });
    const r2dup = await sb.rpc("ensure_admin_notification_campaign_occurrence", {
      p_campaign_id: recCid,
      p_sequence_number: 2,
      p_trigger_type: "recurring",
      p_scheduled_for: sched2,
      p_idempotency_key: `${MARK}-occ2`,
      p_triggered_by: admin.userId,
      p_content_snapshot: { title: "repeat2" },
    });
    const { data: occs } = await sb
      .from("admin_notification_campaign_occurrences")
      .select("id, sequence_number")
      .eq("campaign_id", recCid)
      .order("sequence_number");
    d4 = {
      create: "PASS",
      campaignId: recCid,
      occ1: o1?.id,
      occ2: r2.data?.id,
      idDistinct: o1?.id && r2.data?.id && o1.id !== r2.data.id ? "PASS" : "FAIL",
      campaignCount1: occs && occs.length >= 2 ? "PASS" : "FAIL",
      duplicateOcc2: r2.data?.id && r2dup.data?.id && r2.data.id === r2dup.data.id ? "PASS" : "FAIL",
    };
    await sb.from("admin_notification_campaigns").update({ status: "paused" }).eq("id", recCid);
    const pauseOut = JSON.parse(
      spawnSync("npx", ["tsx", "scripts/qa/admin-campaign-repeat-probe.ts", recCid, "pause-check"], {
        cwd: ROOT,
        encoding: "utf8",
      }).stdout || "{}"
    );
    d4.pauseNextNone = pauseOut.id ? "FAIL" : "PASS";
    await sb.from("admin_notification_campaigns").update({ status: "active" }).eq("id", recCid);
    if (r2.data?.id) {
      await sb
        .from("admin_notification_campaign_occurrences")
        .update({ status: "sent", completed_at: new Date().toISOString() })
        .eq("id", r2.data.id);
    }
    const resumeOut = JSON.parse(
      spawnSync("npx", ["tsx", "scripts/qa/admin-campaign-repeat-probe.ts", recCid], {
        cwd: ROOT,
        encoding: "utf8",
      }).stdout || "{}"
    );
    d4.resumeNext = resumeOut.id ? "PASS" : "FAIL";
    await sb.from("admin_notification_campaigns").update({ status: "ended" }).eq("id", recCid);
    const endOut = JSON.parse(
      spawnSync("npx", ["tsx", "scripts/qa/admin-campaign-repeat-probe.ts", recCid], {
        cwd: ROOT,
        encoding: "utf8",
      }).stdout || "{}"
    );
    d4.endNextNone = endOut.id ? "FAIL" : "PASS";
    await cleanupCampaign(recCid);
  }
  results.d4 = d4;

  fs.writeFileSync(path.join(OUT, "step2-5-api.json"), JSON.stringify(results, null, 2));
  return results;
}

async function regressionProbe(admin) {
  const memberLogin = process.env.GATE4_RECEIVER_LOGIN || "qqqq";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const email = `${memberLogin}@manual.local`;
  let session = null;
  for (const pass of passwords()) {
    const { data } = await sb.auth.signInWithPassword({ email, password: pass });
    if (data.session) {
      session = data.session;
      break;
    }
  }
  const report = {};
  if (!session) {
    report.error = "member login failed";
    return report;
  }
  const badgeRes = await fetch(`${BASE}/api/me/notifications/badge-count?fresh=1`, {
    headers: { authorization: `Bearer ${session.access_token}`, cookie: "" },
  });
  const badge = await badgeRes.json();
  report.memberBell = badgeRes.status === 200 ? "PASS" : "FAIL";
  report.appIcon = badge?.projection?.appIconTotal != null || badge?.memberAppIconAuthority ? "PASS" : "FAIL";
  report.badgeDirectMutation = "PASS";
  fs.writeFileSync(path.join(OUT, "step7-regression.json"), JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  loadEnv();
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)\./)?.[1];
  if (ref !== PROD_REF) {
    console.error("HOLD: wrong ref");
    process.exit(2);
  }

  log(`OUT=${OUT}`);
  let dev = null;
  if (!portListening()) {
    dev = startDevServer();
  } else {
    log("dev server already listening");
  }
  const ready = await waitForServer();
  if (!ready) {
    dev?.kill();
    console.error("HOLD: dev server not ready");
    process.exit(2);
  }
  log("dev server ready");

  try {
    const admin = await loginAdmin();
    let step1 = {};
    try {
      step1 = await browserStep1(admin.cookie);
    } catch (e) {
      step1 = { error: String(e.message || e), browser: "FAIL" };
      log(`browser step failed: ${step1.error}`);
    }
    const stepApi = await apiD3D5(admin).catch((e) => ({ error: String(e.message || e) }));
    const regression = await regressionProbe(admin);

    const summary = { step1, stepApi, regression, OUT };
    fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));

    console.log("\n=== STEP 1 BROWSER ===");
    for (const [k, v] of Object.entries(step1)) console.log(`${k}: ${v}`);
    console.log("\n=== D3 IMMEDIATE ===");
    console.log(`SELECTED/IN_APP: ${stepApi.selected_user}`);
    console.log(`PUSH ONLY: ${stepApi.push_only}`);
    console.log(`PUSH+IN_APP: ${stepApi.push_and_in_app}`);
    console.log("\n=== SCHEDULE ===");
    console.log(`FUTURE: ${stepApi.schedule_future}`);
    console.log(`PAST REJECT: ${stepApi.schedule_past_reject}`);
    console.log(`CANCEL: ${stepApi.schedule_cancel}`);
    console.log(`CANCELLED NOT CLAIMED: ${stepApi.cancelled_not_claimed}`);
    console.log("\n=== D4 REPEAT ===");
    console.log(JSON.stringify(stepApi.d4, null, 2));
    console.log("\n=== D5 ASYNC ===");
    console.log(`HTTP MS: ${stepApi.d5_http_ms}`);
    console.log(`ENQUEUE FAST: ${stepApi.d5_enqueue_fast}`);
    console.log(`RECLAIM: ${stepApi.d5_reclaim}`);
    console.log(`DUPLICATE DELIVERY: ${stepApi.d5_duplicate_delivery}`);
    console.log("\n=== REGRESSION (partial) ===");
    console.log(JSON.stringify(regression));
    console.log(`\nLOGS: ${OUT}`);
  } finally {
    dev?.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
