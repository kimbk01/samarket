#!/usr/bin/env node
/**
 * P6 — Owner BC submit → pre-approve hidden → Admin approve → show → pause.
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node scripts/qa/platform-popup-p6-owner-roundtrip-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

function encodeStoreCta(storeId) {
  const href = `/stores/${encodeURIComponent(storeId.trim())}`;
  // Production PATCH validates store-type CTA with entity lookup; internal_page is path-only.
  return { ctaType: "internal_page", ctaTarget: href, externalUrl: null, href };
}

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/platform-popup-p6-runtime");
const REPORT = resolve(OUT_DIR, "p6-owner-roundtrip-report.json");
const CREATIVE = resolve(process.cwd(), "docs/perf/platform-popup-p4-runtime/creative-1440x1000.png");
const STORE_ID = process.env.P6_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = process.env.P6_OWNER_EMAIL || "sadads@adsasdsa.com";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords(preferred) {
  return [
    ...new Set(
      [
        preferred,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function login(email, preferredPass) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords(preferredPass)) {
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

async function api(cookie, path, method = "GET", body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function uploadOwnerCreative(cookie, requestId) {
  const buf = readFileSync(CREATIVE);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), "creative-1440x1000.png");
  form.append("applyCrop", "center");
  form.append("altText", "P6 Owner Popup QA");
  const res = await fetch(`${ORIGIN}/api/me/platform-popup-requests/${requestId}/creative`, {
    method: "POST",
    headers: { cookie, accept: "application/json" },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

function passFail(ok) {
  return ok ? "PASS" : "FAIL";
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    origin: ORIGIN,
    phase: "P6_OWNER_ROUNDTRIP",
    storeId: STORE_ID,
    verdicts: {},
    steps: {},
  };

  const ownerLogin = await login(OWNER_EMAIL);
  report.steps.ownerLogin = { ok: Boolean(ownerLogin?.session), email: OWNER_EMAIL, userId: ownerLogin?.session?.user?.id || null };
  if (!ownerLogin?.session) {
    report.verdicts.P6 = "NOT_PROVEN";
    report.blocker = "owner_login_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const ownerCookie = await cookieHeader(ownerLogin.sb, ownerLogin.session);

  const pkgs = await api(ownerCookie, "/api/me/platform-popup-packages");
  const packageId = pkgs.json?.packages?.[0]?.id || pkgs.json?.items?.[0]?.id || null;
  report.steps.packages = { status: pkgs.status, ok: pkgs.ok, packageId, count: (pkgs.json?.packages || pkgs.json?.items || []).length };

  const draft = await api(ownerCookie, "/api/me/platform-popup-requests", "POST", { storeId: STORE_ID });
  const requestId = draft.json?.item?.id || null;
  report.steps.draft = { status: draft.status, ok: draft.ok, requestId, error: draft.json?.error || null };
  if (!requestId) {
    report.verdicts.P6 = "FAIL";
    report.blocker = "draft_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const startAt = new Date(Date.now() - 60_000).toISOString();
  const endAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const cta = encodeStoreCta(STORE_ID);
  const patch = await api(ownerCookie, `/api/me/platform-popup-requests/${requestId}`, "PATCH", {
    packageId,
    surfaces: ["TRADE"],
    startAt,
    endAt,
    ctaType: cta.ctaType,
    ctaTarget: cta.ctaTarget,
  });
  report.steps.patch = { status: patch.status, ok: patch.ok, error: patch.json?.error || null, cta };

  const creative = await uploadOwnerCreative(ownerCookie, requestId);
  report.steps.creative = {
    status: creative.status,
    ok: creative.ok,
    error: creative.json?.error || null,
    keys: creative.json ? Object.keys(creative.json) : [],
    hasUrl: Boolean(creative.json?.item?.creativeAssetUrl || creative.json?.url),
  };

  const afterCreative = await api(ownerCookie, `/api/me/platform-popup-requests/${requestId}`);
  report.steps.afterCreative = {
    status: afterCreative.status,
    ok: afterCreative.ok,
    hasPath: Boolean(afterCreative.json?.item?.creativeAssetPath),
    hasUrl: Boolean(afterCreative.json?.item?.creativeAssetUrl),
    requestStatus: afterCreative.json?.item?.requestStatus || null,
    packageId: afterCreative.json?.item?.packageId || null,
  };

  const idempotencyKey = `p6-popup-${requestId}-${randomUUID()}`;
  const submit = await api(ownerCookie, `/api/me/platform-popup-requests/${requestId}/submit`, "POST", {
    idempotencyKey,
  });
  report.steps.submit = {
    status: submit.status,
    ok: submit.ok,
    paymentStatus: submit.json?.item?.paymentStatus || null,
    requestStatus: submit.json?.item?.requestStatus || null,
    error: submit.json?.error || null,
    insufficient: submit.json?.insufficient || null,
  };

  const resolvePre = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) => r.json());
  report.steps.resolvePreApprove = resolvePre;
  const preHidden = !resolvePre?.winner;

  const adminLogin = await login(ADMIN_EMAIL);
  report.steps.adminLogin = { ok: Boolean(adminLogin?.session), userId: adminLogin?.session?.user?.id || null };
  if (!adminLogin?.session) {
    report.verdicts.P6 = "NOT_PROVEN";
    report.blocker = "admin_login_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const adminCookie = await cookieHeader(adminLogin.sb, adminLogin.session);

  // Production lifecycle: approve request (creates campaign pending_review) then approved → active.
  const approveReq = await api(adminCookie, `/api/admin/platform-popup-requests/${requestId}/actions`, "POST", {
    action: "approve",
    activate: false,
  });
  const campaignId = approveReq.json?.campaignId || null;
  report.steps.adminApproveRequest = {
    status: approveReq.status,
    ok: approveReq.ok,
    campaignId,
    error: approveReq.json?.error || null,
  };

  let activateOk = false;
  if (campaignId) {
    const toApproved = await api(adminCookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
      action: "approve",
    });
    const toActive = await api(adminCookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
      action: "transition",
      nextStatus: "active",
    });
    report.steps.campaignActivate = {
      approve: { status: toApproved.status, ok: toApproved.ok, after: toApproved.json?.status, error: toApproved.json?.error },
      active: { status: toActive.status, ok: toActive.ok, after: toActive.json?.status, error: toActive.json?.error },
    };
    activateOk = toActive.ok && toActive.json?.status === "active";
  }

  const resolvePost = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) => r.json());
  report.steps.resolvePostApprove = resolvePost;
  const postShown = resolvePost?.winner?.campaignId === campaignId;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  let cardVisible = false;
  try {
    await page.locator("[data-platform-popup-card]").first().waitFor({ state: "visible", timeout: 25_000 });
    cardVisible = true;
  } catch {
    cardVisible = false;
  }
  await page.screenshot({ path: resolve(OUT_DIR, "p6-market-after-approve-390.png") });
  report.steps.uiAfterApprove = { cardVisible, url: page.url() };
  await browser.close();

  if (campaignId) {
    const pause = await api(adminCookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
      action: "transition",
      nextStatus: "paused",
    });
    report.steps.pause = { ok: pause.ok, after: pause.json?.status, error: pause.json?.error };
  }

  const funded = submit.json?.item?.paymentStatus === "funded" || submit.ok;
  const p6Ok = Boolean(requestId) && creative.ok && patch.ok && funded && preHidden && approveReq.ok && activateOk && postShown && cardVisible;

  report.verdicts = {
    OWNER_DRAFT: passFail(Boolean(requestId)),
    CREATIVE: passFail(creative.ok),
    BC_SUBMIT: passFail(funded),
    PRE_APPROVE_HIDDEN: passFail(preHidden),
    ADMIN_APPROVE_REQUEST: passFail(approveReq.ok && Boolean(campaignId)),
    ACTIVATE: passFail(activateOk),
    POST_APPROVE_RESOLVE: passFail(postShown),
    UI_POPUP_CARD: passFail(cardVisible),
    P6_OWNER_ROUNDTRIP: passFail(p6Ok),
  };
  report.campaignId = campaignId;
  report.requestId = requestId;
  report.PRODUCT_CLOSED = p6Ok ? "NO_UNTIL_P5_FULL_AND_PRODUCT_LOCK" : "NO";
  report.note = "PRODUCT CLOSED still requires full P0–P6 PASS including P5 tablet bottom + iOS.";
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(p6Ok ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
