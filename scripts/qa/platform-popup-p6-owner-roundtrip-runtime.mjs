#!/usr/bin/env node
/**
 * P6 — Owner BC submit → pre-approve hidden → Admin approve → show → pause
 *        (+ optional reject/refund second request when balance allows).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node scripts/qa/platform-popup-p6-owner-roundtrip-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

function encodeStoreCta(storeId) {
  const href = `/stores/${encodeURIComponent(storeId.trim())}`;
  return { ctaType: "internal_page", ctaTarget: href, externalUrl: null, href };
}

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/platform-popup-p6-runtime");
const REPORT = resolve(OUT_DIR, "p6-owner-roundtrip-report.json");
const CREATIVE = resolve(process.cwd(), "docs/perf/platform-popup-p4-runtime/creative-1440x1000.png");
const STORE_ID = process.env.P6_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = process.env.P6_OWNER_EMAIL || "sadads@adsasdsa.com";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const PRODUCTION_SHA =
  process.env.EXPECTED_SHA ||
  spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { encoding: "utf8" }).stdout.trim() ||
  "unknown";

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

function pickBalance(json) {
  const n = Number(json?.assets?.businessCash?.balanceMinor ?? NaN);
  return Number.isFinite(n) ? n : null;
}

async function readBalance(cookie) {
  const res = await api(cookie, `/api/me/stores/${STORE_ID}/business-cash`);
  return { status: res.status, ok: res.ok, balanceMinor: pickBalance(res.json) };
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

async function composeOwnerRequest(ownerCookie, packageId) {
  const draft = await api(ownerCookie, "/api/me/platform-popup-requests", "POST", { storeId: STORE_ID });
  const requestId = draft.json?.item?.id || null;
  if (!requestId) return { ok: false, draft };

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
  const creative = await uploadOwnerCreative(ownerCookie, requestId);
  const afterCreative = await api(ownerCookie, `/api/me/platform-popup-requests/${requestId}`);
  return {
    ok: Boolean(requestId) && patch.ok && creative.ok,
    requestId,
    draft,
    patch,
    creative,
    afterCreative,
    cta,
  };
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
    productionSha: PRODUCTION_SHA,
    phase: "P6_OWNER_ROUNDTRIP",
    storeId: STORE_ID,
    surface: "TRADE",
    route: "/market",
    verdicts: {},
    steps: {},
    PRODUCT_CLOSED: "NO",
  };

  const ownerLogin = await login(OWNER_EMAIL);
  report.steps.ownerLogin = {
    ok: Boolean(ownerLogin?.session),
    email: OWNER_EMAIL,
    userId: ownerLogin?.session?.user?.id || null,
  };
  if (!ownerLogin?.session) {
    report.verdicts.P6 = "NOT_PROVEN";
    report.blocker = "owner_login_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const ownerCookie = await cookieHeader(ownerLogin.sb, ownerLogin.session);

  const pkgs = await api(ownerCookie, "/api/me/platform-popup-packages");
  const pkg = pkgs.json?.packages?.[0] || pkgs.json?.items?.[0] || null;
  const packageId = pkg?.id || null;
  const priceMinor = Number(pkg?.priceMinor ?? pkg?.price_minor ?? 500000);
  report.steps.packages = {
    status: pkgs.status,
    ok: pkgs.ok,
    packageId,
    priceMinor,
    count: (pkgs.json?.packages || pkgs.json?.items || []).length,
  };

  const balBefore = await readBalance(ownerCookie);
  report.steps.bcBeforeSubmit = balBefore;
  if ((balBefore.balanceMinor ?? 0) < priceMinor) {
    report.verdicts.P6_BC_ACQUISITION = "BLOCKED";
    report.verdicts.P6_OWNER_SUBMIT = "BLOCKED";
    report.blocker = "INSUFFICIENT_BUSINESS_CASH";
    report.insufficient = { availableMinor: balBefore.balanceMinor, requiredMinor: priceMinor };
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.verdicts.P6_BC_ACQUISITION = "PASS";

  const composed = await composeOwnerRequest(ownerCookie, packageId);
  const requestId = composed.requestId;
  report.steps.draft = {
    status: composed.draft?.status,
    ok: composed.draft?.ok,
    requestId,
    error: composed.draft?.json?.error || null,
  };
  report.steps.patch = {
    status: composed.patch?.status,
    ok: composed.patch?.ok,
    error: composed.patch?.json?.error || null,
    cta: composed.cta,
  };
  report.steps.creative = {
    status: composed.creative?.status,
    ok: composed.creative?.ok,
    error: composed.creative?.json?.error || null,
    hasUrl: Boolean(composed.creative?.json?.item?.creativeAssetUrl || composed.creative?.json?.url),
  };
  report.steps.afterCreative = {
    status: composed.afterCreative?.status,
    ok: composed.afterCreative?.ok,
    hasPath: Boolean(composed.afterCreative?.json?.item?.creativeAssetPath),
    hasUrl: Boolean(composed.afterCreative?.json?.item?.creativeAssetUrl),
    requestStatus: composed.afterCreative?.json?.item?.requestStatus || null,
    packageId: composed.afterCreative?.json?.item?.packageId || null,
  };
  if (!requestId || !composed.ok) {
    report.verdicts.P6_OWNER_SUBMIT = "FAIL";
    report.blocker = "compose_failed";
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const idempotencyKey = `p6-popup-${requestId}-${randomUUID()}`;
  const submit = await api(ownerCookie, `/api/me/platform-popup-requests/${requestId}/submit`, "POST", {
    idempotencyKey,
  });
  const balAfterDebit = await readBalance(ownerCookie);
  report.steps.submit = {
    status: submit.status,
    ok: submit.ok,
    paymentStatus: submit.json?.item?.paymentStatus || null,
    requestStatus: submit.json?.item?.requestStatus || null,
    error: submit.json?.error || null,
    detail: submit.json?.detail || null,
    insufficient: submit.json?.insufficient || null,
  };
  report.steps.bcAfterSubmit = balAfterDebit;
  report.steps.bcDebit = {
    expectedDebit: priceMinor,
    before: balBefore.balanceMinor,
    after: balAfterDebit.balanceMinor,
    observedDebit:
      balBefore.balanceMinor != null && balAfterDebit.balanceMinor != null
        ? balBefore.balanceMinor - balAfterDebit.balanceMinor
        : null,
  };

  const resolvePre = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) => r.json());
  report.steps.resolvePreApprove = resolvePre;
  const preHidden = !resolvePre?.winner;
  // PAYMENT != ACTIVE: funded/submitted must not already be resolve winner
  report.steps.paymentNotActive = {
    paymentStatus: submit.json?.item?.paymentStatus || null,
    requestStatus: submit.json?.item?.requestStatus || null,
    winnerBeforeAdmin: resolvePre?.winner || null,
  };

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
      approve: {
        status: toApproved.status,
        ok: toApproved.ok,
        after: toApproved.json?.status,
        error: toApproved.json?.error,
      },
      active: { status: toActive.status, ok: toActive.ok, after: toActive.json?.status, error: toActive.json?.error },
    };
    activateOk = toActive.ok && toActive.json?.status === "active";
  }

  const resolvePost = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) => r.json());
  report.steps.resolvePostApprove = resolvePost;
  const postShown = resolvePost?.winner?.campaignId === campaignId;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/market`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  let cardVisible = false;
  try {
    await page.locator("[data-platform-popup-card]").first().waitFor({ state: "visible", timeout: 25_000 });
    await page.locator('.dibay-platform-popup-root[data-entered="true"]').first().waitFor({
      state: "attached",
      timeout: 10_000,
    });
    cardVisible = true;
  } catch {
    cardVisible = false;
  }
  await page.screenshot({ path: resolve(OUT_DIR, "p6-market-after-approve-390.png") });
  report.steps.uiAfterApprove = { cardVisible, url: page.url() };
  await browser.close();

  // Events: wait briefly for renderer impression, then read admin campaign detail if available
  if (campaignId) {
    await new Promise((r) => setTimeout(r, 4000));
    const detail = await api(adminCookie, `/api/admin/platform-popup-campaigns/${campaignId}`);
    const eventSummary = detail.json?.campaign?.eventSummary || detail.json?.eventSummary || detail.json?.events || null;
    report.steps.events = {
      status: detail.status,
      ok: detail.ok,
      eventSummary,
      campaignStatus: detail.json?.campaign?.status || null,
    };
    // Service-role fallback count
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const { data: evRows, error } = await sb
        .from("platform_popup_campaign_events")
        .select("event_type")
        .eq("campaign_id", campaignId);
      const counts = {};
      for (const row of evRows || []) {
        const k = row.event_type || "unknown";
        counts[k] = (counts[k] || 0) + 1;
      }
      report.steps.eventsDb = { error: error?.message || null, counts, total: (evRows || []).length };
    }
  }

  if (campaignId) {
    const pause = await api(adminCookie, `/api/admin/platform-popup-campaigns/${campaignId}/transition`, "POST", {
      action: "transition",
      nextStatus: "paused",
    });
    report.steps.pause = { ok: pause.ok, after: pause.json?.status, error: pause.json?.error };
  }

  // --- Reject / refund second request (canonical) when remaining balance covers package ---
  const balBeforeReject = await readBalance(ownerCookie);
  report.steps.bcBeforeRejectFlow = balBeforeReject;
  if ((balBeforeReject.balanceMinor ?? 0) >= priceMinor) {
    const rejCompose = await composeOwnerRequest(ownerCookie, packageId);
    const rejId = rejCompose.requestId;
    report.steps.rejectCompose = {
      ok: rejCompose.ok,
      requestId: rejId,
      creativeOk: rejCompose.creative?.ok,
    };
    if (rejId && rejCompose.ok) {
      const rejSubmit = await api(ownerCookie, `/api/me/platform-popup-requests/${rejId}/submit`, "POST", {
        idempotencyKey: `p6-reject-${rejId}-${randomUUID()}`,
      });
      const balAfterRejectDebit = await readBalance(ownerCookie);
      report.steps.rejectSubmit = {
        status: rejSubmit.status,
        ok: rejSubmit.ok,
        paymentStatus: rejSubmit.json?.item?.paymentStatus || null,
        requestStatus: rejSubmit.json?.item?.requestStatus || null,
        error: rejSubmit.json?.error || null,
      };
      report.steps.bcAfterRejectDebit = balAfterRejectDebit;

      const rejAct = await api(adminCookie, `/api/admin/platform-popup-requests/${rejId}/actions`, "POST", {
        action: "reject",
        reason: "P6 reject/refund runtime proof",
      });
      const balAfterRefund = await readBalance(ownerCookie);
      report.steps.rejectAction = {
        status: rejAct.status,
        ok: rejAct.ok,
        error: rejAct.json?.error || null,
        campaignId: rejAct.json?.campaignId || null,
        jsonKeys: rejAct.json ? Object.keys(rejAct.json) : [],
      };
      report.steps.bcAfterRefund = balAfterRefund;
      report.steps.rejectRefundMath = {
        beforeDebit: balBeforeReject.balanceMinor,
        afterDebit: balAfterRejectDebit.balanceMinor,
        afterRefund: balAfterRefund.balanceMinor,
        restored:
          balBeforeReject.balanceMinor != null &&
          balAfterRefund.balanceMinor != null &&
          balAfterRefund.balanceMinor === balBeforeReject.balanceMinor,
      };

      // Idempotent second reject must not double-refund
      const rejAct2 = await api(adminCookie, `/api/admin/platform-popup-requests/${rejId}/actions`, "POST", {
        action: "reject",
        reason: "P6 double-reject idempotency",
      });
      const balAfterSecondReject = await readBalance(ownerCookie);
      report.steps.rejectIdempotency = {
        secondRejectStatus: rejAct2.status,
        secondRejectOk: rejAct2.ok,
        secondRejectError: rejAct2.json?.error || null,
        balanceUnchanged: balAfterSecondReject.balanceMinor === balAfterRefund.balanceMinor,
        balanceAfter: balAfterSecondReject.balanceMinor,
      };

      const resolveAfterReject = await fetch(`${ORIGIN}/api/platform-popup/resolve?pathname=/market`).then((r) =>
        r.json()
      );
      report.steps.resolveAfterReject = {
        winner: resolveAfterReject?.winner || null,
        reason: resolveAfterReject?.reason || null,
      };
    }
  } else {
    report.steps.rejectRefund = {
      status: "NOT_PROVEN",
      reason: "insufficient_balance_for_second_submit",
      balanceMinor: balBeforeReject.balanceMinor,
      requiredMinor: priceMinor,
    };
  }

  const funded =
    submit.ok &&
    (submit.json?.item?.paymentStatus === "funded" ||
      submit.json?.item?.requestStatus === "pending_review" ||
      submit.json?.item?.requestStatus === "submitted");
  const debitOk =
    report.steps.bcDebit.observedDebit != null && report.steps.bcDebit.observedDebit === priceMinor;
  const eventsOk = Boolean(
    (report.steps.eventsDb?.counts?.impression || 0) > 0 ||
      (report.steps.events?.eventSummary &&
        (report.steps.events.eventSummary.impression > 0 ||
          report.steps.events.eventSummary?.impression?.count > 0))
  );
  const rejectRestored = report.steps.rejectRefundMath?.restored === true;
  const rejectNoDouble = report.steps.rejectIdempotency?.balanceUnchanged === true;
  const rejectNoWinner = !report.steps.resolveAfterReject?.winner;
  const rejectSubmitFunded = Boolean(report.steps.rejectSubmit?.ok);
  const rejectPass = rejectSubmitFunded && rejectRestored && rejectNoDouble && rejectNoWinner;

  const p6Ok = Boolean(
    requestId &&
      composed.ok &&
      funded &&
      debitOk &&
      preHidden &&
      approveReq.ok &&
      activateOk &&
      postShown &&
      cardVisible
  );

  report.verdicts = {
    P6_BC_ACQUISITION: "PASS",
    OWNER_DRAFT: passFail(Boolean(requestId)),
    CREATIVE: passFail(composed.creative?.ok),
    P6_OWNER_SUBMIT: passFail(funded),
    P6_BC_DEBIT: passFail(debitOk),
    P6_PRE_APPROVAL_NON_EXPOSURE: passFail(preHidden),
    P6_ADMIN_APPROVAL: passFail(approveReq.ok && Boolean(campaignId)),
    P6_POST_APPROVAL_WINNER: passFail(postShown),
    P6_VISIBLE_POPUP: passFail(cardVisible),
    P6_EVENTS: eventsOk ? "PASS" : "NOT_PROVEN",
    P6_REJECT_REFUND: report.steps.rejectRefund?.status === "NOT_PROVEN" ? "NOT_PROVEN" : passFail(rejectPass),
    P6_OWNER_ROUNDTRIP: passFail(p6Ok),
  };
  report.campaignId = campaignId;
  report.requestId = requestId;
  report.PRODUCT_CLOSED = "NO";
  report.note =
    "PRODUCT CLOSED requires P5 iOS native PASS + full P6 owner paid E2E including reject/refund when required. No product code changes in this run.";
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(p6Ok ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
