#!/usr/bin/env node
/**
 * P4 — Admin direct → Production 실노출 runtime close.
 * Creates (or reuses) a TRADE campaign, activates, proves popup card, then pauses.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node scripts/qa/platform-popup-p4-admin-direct-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/platform-popup-p4-runtime");
const REPORT = resolve(OUT_DIR, "p4-admin-direct-report.json");
const CREATIVE = resolve(OUT_DIR, "creative-1440x1000.png");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const CAMPAIGN_NAME = `P4 Admin Direct QA ${new Date().toISOString().slice(0, 16)}`;

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
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

async function loginSession(email) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { sb, session: data.session };
  }
  return null;
}

async function cookieHeader(sb, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const CHUNK = 3180;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) chunks.push(encoded.slice(i, i + CHUNK));
  const auth =
    chunks.length === 1
      ? [`sb-${ref}-auth-token=${chunks[0]}`]
      : chunks.map((value, index) => `sb-${ref}-auth-token.${index}=${value}`);
  const { data: profile } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profile?.active_session_id) {
    auth.push(`samarket_active_session_id=${encodeURIComponent(String(profile.active_session_id))}`);
  }
  return auth.join("; ");
}

function browserCookies(header) {
  return header.split("; ").map((part) => {
    const separator = part.indexOf("=");
    return {
      name: part.slice(0, separator),
      value: part.slice(separator + 1),
      domain: new URL(ORIGIN).hostname,
      path: "/",
      secure: true,
      sameSite: "Lax",
    };
  });
}

async function api(cookie, path, method = "GET", body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    redirect: "manual",
    headers: {
      cookie,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json };
}

async function uploadCreative(cookie, campaignId) {
  const buf = readFileSync(CREATIVE);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), "creative-1440x1000.png");
  form.append("applyCrop", "center");
  form.append("altText", "P4 Admin Direct QA");
  const res = await fetch(`${ORIGIN}/api/admin/platform-popup-campaigns/${campaignId}/creative`, {
    method: "POST",
    headers: { cookie, accept: "application/json" },
    body: form,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json };
}

async function publicResolve(pathname) {
  const res = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=${encodeURIComponent(pathname)}`, {
    headers: { accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function passFail(ok) {
  return ok ? "PASS" : "FAIL";
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(CREATIVE)) {
    throw new Error(`missing_creative:${CREATIVE}`);
  }

  const report = {
    at: new Date().toISOString(),
    origin: ORIGIN,
    phase: "P4_ADMIN_DIRECT_RUNTIME",
    verdicts: {},
    steps: {},
  };

  const login = await loginSession(ADMIN_EMAIL);
  report.steps.adminLogin = { ok: Boolean(login?.session), email: ADMIN_EMAIL, userId: login?.session?.user?.id || null };
  if (!login?.session) {
    report.verdicts.P4 = "NOT_PROVEN";
    report.blocker = "admin_login_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const cookie = await cookieHeader(login.sb, login.session);

  const create = await api(cookie, "/api/admin/platform-popup-campaigns", "POST", {
    name: CAMPAIGN_NAME,
    surfaces: ["TRADE"],
    priority: 9000,
  });
  report.steps.create = { status: create.status, ok: create.ok, id: create.json?.id || null, error: create.json?.error || null };
  const campaignId = create.json?.id;
  if (!campaignId) {
    report.verdicts.P4 = "FAIL";
    report.blocker = "create_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const creative = await uploadCreative(cookie, campaignId);
  report.steps.creative = {
    status: creative.status,
    ok: creative.ok,
    error: creative.json?.error || null,
  };

  const startAt = new Date(Date.now() - 60_000).toISOString();
  const endAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const patch = await api(cookie, `/api/admin/platform-popup-campaigns/${campaignId}`, "PATCH", {
    name: CAMPAIGN_NAME,
    priority: 9000,
    surfaces: ["TRADE"],
    startAt,
    endAt,
    timezone: "Asia/Manila",
    suppressionMode: "TODAY",
    ctaType: "internal_page",
    ctaTarget: "/market",
  });
  report.steps.patch = { status: patch.status, ok: patch.ok, error: patch.json?.error || null };

  // Lifecycle SSOT: draft → pending_review → approved → active (no skip).
  const submit = await api(cookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
    action: "transition",
    nextStatus: "pending_review",
    nextApproval: "pending_review",
  });
  report.steps.submitReview = {
    status: submit.status,
    ok: submit.ok,
    statusAfter: submit.json?.status || null,
    approvalStatus: submit.json?.approvalStatus || null,
    error: submit.json?.error || null,
  };

  const approveOnly = await api(
    cookie,
    `/api/admin/platform-popup-campaigns/${campaignId}/transition`,
    "POST",
    { action: "approve" }
  );
  report.steps.approveOnly = {
    status: approveOnly.status,
    ok: approveOnly.ok,
    statusAfter: approveOnly.json?.status || null,
    approvalStatus: approveOnly.json?.approvalStatus || null,
    error: approveOnly.json?.error || null,
  };

  const activate = await api(cookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
    action: "transition",
    nextStatus: "active",
  });
  report.steps.activate = {
    status: activate.status,
    ok: activate.ok,
    statusAfter: activate.json?.status || null,
    approvalStatus: activate.json?.approvalStatus || null,
    error: activate.json?.error || null,
  };
  report.steps.approve = {
    status: activate.status,
    ok: activate.ok && activate.json?.status === "active",
    statusAfter: activate.json?.status || null,
    approvalStatus: activate.json?.approvalStatus || null,
    error: activate.json?.error || approveOnly.json?.error || submit.json?.error || null,
  };

  const resolveMarket = await publicResolve("/market");
  const resolvePhilife = await publicResolve("/philife");
  const resolveCart = await publicResolve("/stores/cart");
  const resolveMessenger = await publicResolve("/community-messenger");
  report.steps.resolve = {
    market: resolveMarket.json,
    philife: resolvePhilife.json,
    cart: resolveCart.json,
    messenger: resolveMessenger.json,
  };

  const marketWinner = resolveMarket.json?.winner?.campaignId === campaignId;
  const philifeNoWinner = !resolvePhilife.json?.winner;
  const cartExcluded =
    resolveCart.json?.reason === "surface_excluded" ||
    resolveCart.json?.surface === "ORDER_CRITICAL" ||
    !resolveCart.json?.winner;
  const messengerExcluded =
    resolveMessenger.json?.reason === "surface_excluded" ||
    resolveMessenger.json?.surface === "MESSENGER";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies(browserCookies(cookie));
  const page = await context.newPage();

  await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  let cardVisible = false;
  try {
    await page.locator("[data-platform-popup-card]").first().waitFor({ state: "visible", timeout: 25_000 });
    cardVisible = true;
  } catch {
    cardVisible = false;
  }
  const hostAttrs = await page.evaluate(() => {
    const host = document.querySelector("[data-platform-popup-host]");
    if (!host) return null;
    return [...host.attributes].map((a) => `${a.name}=${a.value}`);
  });
  await page.screenshot({ path: resolve(OUT_DIR, "p4-market-390.png"), fullPage: false });
  report.steps.uiMarket = { cardVisible, hostAttrs, url: page.url() };

  await page.goto(`${ORIGIN}/stores/cart`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  const cartCard = await page.locator("[data-platform-popup-card]").count();
  await page.screenshot({ path: resolve(OUT_DIR, "p4-cart-critical-390.png"), fullPage: false });
  report.steps.uiCart = { cardCount: cartCard, url: page.url() };

  await page.goto(`${ORIGIN}/admin/platform-popup`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);
  const hubOk = (await page.locator("[data-admin-platform-popup-hub]").count()) > 0;
  await page.screenshot({ path: resolve(OUT_DIR, "p4-admin-hub-820.png"), fullPage: false });
  report.steps.uiHub = { hubOk, url: page.url() };

  await browser.close();

  // Pause so Production users are not stuck with QA popup.
  const pause = await api(cookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
    action: "transition",
    nextStatus: "paused",
  });
  report.steps.pause = { status: pause.status, ok: pause.ok, error: pause.json?.error || null, after: pause.json?.status || null };

  const resolveAfterPause = await publicResolve("/market");
  report.steps.resolveAfterPause = resolveAfterPause.json;

  const p4Ok =
    Boolean(campaignId) &&
    creative.ok &&
    patch.ok &&
    submit.ok &&
    approveOnly.ok &&
    activate.ok &&
    activate.json?.status === "active" &&
    marketWinner &&
    philifeNoWinner &&
    cartExcluded &&
    messengerExcluded &&
    cardVisible &&
    cartCard === 0 &&
    hubOk;

  report.verdicts = {
    CREATE: passFail(Boolean(campaignId)),
    CREATIVE: passFail(creative.ok),
    SUBMIT_REVIEW: passFail(submit.ok),
    APPROVE: passFail(approveOnly.ok && approveOnly.json?.status === "approved"),
    ACTIVATE: passFail(activate.ok && activate.json?.status === "active"),
    APPROVE_ACTIVE: passFail(activate.ok && activate.json?.status === "active"),
    RESOLVE_TRADE_WINNER: passFail(marketWinner),
    RESOLVE_COMMUNITY_NO_CROSS: passFail(philifeNoWinner),
    CRITICAL_CART: passFail(cartExcluded && cartCard === 0),
    MESSENGER_EXCLUDED: passFail(messengerExcluded),
    UI_POPUP_CARD: passFail(cardVisible),
    ADMIN_HUB: passFail(hubOk),
    PAUSE_CLEANUP: passFail(pause.ok || !resolveAfterPause.json?.winner),
    P4_ADMIN_DIRECT_RUNTIME: passFail(p4Ok),
  };
  report.campaignId = campaignId;
  report.PRODUCT_CLOSED = "NO";
  report.note = "P4 only. P5 geometry device shots and P6 Owner BC round-trip remain NOT_PROVEN.";

  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(p4Ok ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
