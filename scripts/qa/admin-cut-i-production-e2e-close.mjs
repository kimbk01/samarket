#!/usr/bin/env node
/**
 * CUT I — DIBAY Admin Real Operation Production E2E close (bounded QA).
 *
 * Honest evidence only — do NOT invent PASS. Never claim PRODUCT READY PASS.
 *
 * Usage:
 *   CUT_I_TARGET_SHA=... node scripts/qa/admin-cut-i-production-e2e-close.mjs
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL / ORIGIN (default https://samarket.vercel.app)
 *   CUT_I_TARGET_SHA | git HEAD
 *   CUT_I_DEPLOY_URL (default https://samarket-de94gn5q2-kimbk01s-projects.vercel.app)
 *   CUT_I_CAMPAIGN_ID / CUT_I_ALLOW_ADS_MUTATION / CUT_I_OWNER_EMAIL
 *   CUT_I_SUPPORT_ID / CUT_I_PARTNER_ID / CUT_I_POPUP_ID / CUT_I_FEED_ID (optional safe mutation)
 *   E2E_* passwords · Supabase keys via .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || process.env.ORIGIN || "https://samarket.vercel.app").replace(
  /\/$/,
  ""
);
const OUT_DIR = resolve(process.cwd(), "docs/perf/admin-cut-i-production-e2e");
const REPORT_JSON = resolve(OUT_DIR, "cut-i-report.json");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const OWNER_EMAIL =
  process.env.CUT_I_OWNER_EMAIL ||
  process.env.E2E_OWNER_EMAIL ||
  "sadads@adsasdsa.com";
const STORE_ID = process.env.CUT_I_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const DEPLOY_URL = (
  process.env.CUT_I_DEPLOY_URL || "https://samarket-de94gn5q2-kimbk01s-projects.vercel.app"
).replace(/\/$/, "");
const VIEWPORT = { width: 1024, height: 768, label: "lg-min landscape (--sam-bp-lg-min)" };
const ALLOW_ADS_MUTATION = process.env.CUT_I_ALLOW_ADS_MUTATION === "1";
const CAMPAIGN_ID = (process.env.CUT_I_CAMPAIGN_ID || "").trim();

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

function targetSha() {
  const env = (process.env.CUT_I_TARGET_SHA || "").trim();
  if (env) return env;
  try {
    return spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  } catch {
    return "";
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

function verdict(status, evidence = {}) {
  return { status, evidence, at: new Date().toISOString() };
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

function authCookies(sessionObj) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: sessionObj.access_token,
      refresh_token: sessionObj.refresh_token,
      expires_at: sessionObj.expires_at,
      expires_in: sessionObj.expires_in,
      token_type: sessionObj.token_type || "bearer",
      user: sessionObj.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: sessionObj.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  return parts.length === 1
    ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
    : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
}

async function cookieHeaderFromSession(session) {
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const payload = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  let cookie = `sb-${ref}-auth-token=${payload}`;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (sk && url) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await sb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return cookie;
}

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

function inspectUrl(url) {
  const r = spawnSync("npx", ["vercel", "inspect", url, "--logs"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
    cwd: process.cwd(),
  });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const dpl = text.match(/\b(dpl_[A-Za-z0-9]+)\b/)?.[1] || null;
  const statusReady = /status\s+●\s+Ready/i.test(text) || /status\s+Ready/i.test(text);
  // Prefer "Commit" labeled lines from --logs; fall back to bare sha tokens.
  let commitLabeled = null;
  const labeled =
    text.match(/Commit[:\s]+([0-9a-f]{7,40})/i) ||
    text.match(/githubCommitSha[:\s]+([0-9a-f]{7,40})/i);
  if (labeled) commitLabeled = labeled[1];
  let commitBare = null;
  const bare = text.match(/\b([0-9a-f]{40})\b/);
  if (bare) commitBare = bare[1];
  const shortBare = text.match(/\b([0-9a-f]{7,12})\b/);
  return {
    url,
    exitCode: r.status,
    deploymentId: dpl,
    statusReady,
    commitLabeled,
    commitFull: commitBare,
    commitShortCandidate: shortBare?.[1] || null,
    aliasHint: /samarket\.vercel\.app/i.test(text),
    snippet: text.slice(0, 1200),
  };
}

function proveDeploy(target) {
  const short = target ? target.slice(0, 9) : "";
  const deployInsp = inspectUrl(DEPLOY_URL);
  const aliasInsp = inspectUrl("samarket.vercel.app");

  const matchAgainst = (insp) => {
    const candidates = [insp.commitLabeled, insp.commitFull, insp.commitShortCandidate].filter(Boolean);
    for (const c of candidates) {
      if (!target) continue;
      const ok =
        c === target ||
        target.startsWith(c) ||
        c.startsWith(target.slice(0, Math.min(c.length, target.length)));
      if (ok) {
        return {
          matched: c,
          source:
            c.length >= 40
              ? "full_sha"
              : insp.commitLabeled
                ? "short_sha_from_logs_Commit_label"
                : "short_sha_from_logs_best_effort",
        };
      }
    }
    return null;
  };

  const deployMatch = matchAgainst(deployInsp);
  const aliasMatch = matchAgainst(aliasInsp);
  const best = deployMatch || aliasMatch;

  let productionShaEvidence = "NOT_PROVEN";
  let status = "NOT_PROVEN";
  const notes = [];

  if (best) {
    productionShaEvidence = {
      value: best.matched,
      kind: best.source,
      note:
        best.source === "full_sha"
          ? "Full commit sha parsed from vercel inspect --logs"
          : "Only short sha available from vercel inspect --logs — not full PRODUCTION_SHA proof",
    };
    if (best.source === "full_sha" && (aliasInsp.statusReady || deployInsp.statusReady)) {
      status = "PASS";
    } else if (best.source.startsWith("short_sha") && aliasInsp.statusReady && deployInsp.statusReady) {
      // CLI meta.githubCommitSha often empty; Commit: short label + Ready alias is established provenance pattern.
      status = "PASS";
      notes.push("short_sha_Commit_label_plus_alias_Ready (CLI full sha meta empty)");
    } else if (best.source.startsWith("short_sha")) {
      status = "PARTIAL";
      notes.push("short_sha_only_from_logs");
    }
  } else {
    notes.push("no_commit_match_in_inspect_logs");
  }

  if (!aliasInsp.statusReady && !deployInsp.statusReady) {
    notes.push("alias_or_deploy_Ready_not_seen");
    if (status === "PASS") status = "PARTIAL";
  }

  return verdict(status, {
    targetSha: target || null,
    deployUrl: DEPLOY_URL,
    alias: "samarket.vercel.app",
    deployInspect: {
      deploymentId: deployInsp.deploymentId,
      statusReady: deployInsp.statusReady,
      commitLabeled: deployInsp.commitLabeled,
      commitFull: deployInsp.commitFull,
      exitCode: deployInsp.exitCode,
    },
    aliasInspect: {
      deploymentId: aliasInsp.deploymentId,
      statusReady: aliasInsp.statusReady,
      commitLabeled: aliasInsp.commitLabeled,
      commitFull: aliasInsp.commitFull,
      exitCode: aliasInsp.exitCode,
      aliasHint: aliasInsp.aliasHint,
    },
    PRODUCTION_SHA: productionShaEvidence,
    notes,
  });
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      pageOverflowX: doc.scrollWidth > doc.clientWidth + 1,
      bodyOverflowX: body ? body.scrollWidth > body.clientWidth + 1 : false,
      url: location.href,
      hasAdminShell: Boolean(document.querySelector("[data-admin]")),
      markers: {
        actionCenter: Boolean(document.querySelector("[data-admin-action-center]")),
        placementMap: Boolean(document.querySelector("[data-admin-placement-map]")),
      },
    };
  });
}

async function shot(page, name) {
  const path = resolve(OUT_DIR, name);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const TARGET_SHA = targetSha();

  const report = {
    title: "DIBAY ADMIN REAL OPERATION — CUT I PRODUCTION E2E CLOSE",
    origin: ORIGIN,
    outDir: OUT_DIR,
    targetSha: TARGET_SHA || null,
    storeId: STORE_ID,
    ownerEmail: OWNER_EMAIL,
    adminEmail: ADMIN_EMAIL,
    viewport: VIEWPORT,
    startedAt: new Date().toISOString(),
    deploy: null,
    finance: null,
    saleRecognition: null,
    ads: null,
    pauseResumeEnd: null,
    placementActive: null,
    creativeParity: null,
    searchTop: null,
    feed: null,
    popup: null,
    support: null,
    partner: null,
    actionCenterBell: null,
    navigation: null,
    tabletBrowser: null,
    reset: null,
    failurePaths: null,
    matrix: {},
    remaining: [],
    finalVerdicts: {
      productReady: "NOT_CLAIMED",
      cutIClose: "NOT_PROVEN",
      note: "Do not claim PRODUCT READY PASS from this script alone.",
    },
  };

  // ── Deploy proof (CLI) ──────────────────────────────────────────
  report.deploy = proveDeploy(TARGET_SHA);
  report.matrix.deploy = report.deploy.status;

  // ── Auth ────────────────────────────────────────────────────────
  const login = await loginSession(ADMIN_EMAIL);
  if (!login?.session) {
    report.failurePaths = verdict("FAIL", { reason: "admin_login_failed", email: ADMIN_EMAIL });
    report.matrix.login = "FAIL";
    report.finalVerdicts.cutIClose = "BLOCKED";
    report.remaining.push("Admin login blocked further scenarios");
    writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ reportPath: REPORT_JSON, matrix: report.matrix, finalVerdicts: report.finalVerdicts }, null, 2));
    process.exit(2);
  }
  report.matrix.login = "PASS";
  const cookie = await cookieHeaderFromSession(login.session);

  // ── Reset fail-closed (safe: no mass delete payloads) ───────────
  const executeProbe = await apiJson(cookie, "POST", "/api/admin/prelaunch-reset/execute", {
    preset: "TEST_CONTENT_ONLY",
    planId: "cut-i-probe-no-delete",
    expectedHash: "cut-i-probe-hash",
    typedConfirmation: "PROBE_ONLY_DO_NOT_EXECUTE",
  });
  const dryRunProbe = await apiJson(cookie, "POST", "/api/admin/prelaunch-reset/dry-run", {
    preset: "TEST_CONTENT_ONLY",
  });
  const execErr = String(executeProbe.json?.error ?? "");
  const dryErr = String(dryRunProbe.json?.error ?? "");
  const executeUnavailable =
    executeProbe.status === 403 &&
    (execErr === "execute_forbidden" ||
      execErr === "super_admin_only" ||
      execErr === "forbidden" ||
      executeProbe.json?.productionExecuteForbidden === true ||
      Array.isArray(executeProbe.json?.reasons));
  const dryRunEnvFailClosed =
    dryRunProbe.status === 403 &&
    (dryErr === "dry_run_forbidden" ||
      (Array.isArray(dryRunProbe.json?.reasons) &&
        dryRunProbe.json.reasons.some((r) =>
          String(r).includes("production_dry_run_requires_explicit_opt_in")
        )));
  const dryRunAuthBlocked = dryRunProbe.status === 403 && dryErr === "super_admin_only";
  // PASS only when env dry-run opt-in fail-closed is proven AND execute unavailable.
  // super_admin_only before env gate ⇒ BLOCKED for dry-run policy proof (not product FAIL).
  let resetStatus = "FAIL";
  if (executeUnavailable && dryRunEnvFailClosed) resetStatus = "PASS";
  else if (executeUnavailable && dryRunAuthBlocked) resetStatus = "BLOCKED";
  else if (executeUnavailable) resetStatus = "PARTIAL";
  report.reset = verdict(resetStatus, {
    execute: {
      status: executeProbe.status,
      error: executeProbe.json?.error,
      reasons: executeProbe.json?.reasons,
    },
    dryRun: {
      status: dryRunProbe.status,
      error: dryRunProbe.json?.error,
      reasons: dryRunProbe.json?.reasons,
    },
    note: "No destructive delete payloads with real mass IDs were sent.",
    expected:
      "Production execute always unavailable; dry-run without PRELAUNCH_RESET_PRODUCTION_DRY_RUN opt-in → 403 dry_run_forbidden (super_admin session required to prove env gate)",
    classification:
      resetStatus === "BLOCKED"
        ? "auth_gate_before_env_gate — execute still unavailable; env dry-run opt-in NOT_PROVEN on this actor"
        : null,
  });
  report.matrix.reset = report.reset.status;

  // Optional: prove env dry-run fail-closed with super_admin actor (no execute).
  const superEmail = (process.env.CUT_I_SUPER_ADMIN_EMAIL || "").trim();
  if (superEmail && report.reset.status === "BLOCKED") {
    const superLogin = await loginSession(superEmail);
    if (superLogin?.session) {
      const superCookie = await cookieHeaderFromSession(superLogin.session);
      const dry2 = await apiJson(superCookie, "POST", "/api/admin/prelaunch-reset/dry-run", {
        preset: "TEST_CONTENT_ONLY",
      });
      const exec2 = await apiJson(superCookie, "POST", "/api/admin/prelaunch-reset/execute", {
        preset: "TEST_CONTENT_ONLY",
        planId: "cut-i-probe-no-delete",
        expectedHash: "cut-i-probe-hash",
        typedConfirmation: "PROBE_ONLY_DO_NOT_EXECUTE",
      });
      const dryEnv =
        dry2.status === 403 &&
        (dry2.json?.error === "dry_run_forbidden" ||
          (Array.isArray(dry2.json?.reasons) &&
            dry2.json.reasons.some((r) =>
              String(r).includes("production_dry_run_requires_explicit_opt_in")
            )));
      const execBlocked = exec2.status === 403;
      if (dryEnv && execBlocked) {
        report.reset = verdict("PASS", {
          ...report.reset.evidence,
          superAdminProbe: {
            email: superEmail,
            dryRun: { status: dry2.status, error: dry2.json?.error, reasons: dry2.json?.reasons },
            execute: { status: exec2.status, error: exec2.json?.error, reasons: exec2.json?.reasons },
          },
          note: "super_admin proved Production dry-run opt-in fail-closed; execute still blocked. No deletes.",
        });
        report.matrix.reset = "PASS";
      } else {
        report.reset.evidence.superAdminProbe = {
          email: superEmail,
          dryRun: { status: dry2.status, error: dry2.json?.error, reasons: dry2.json?.reasons },
          execute: { status: exec2.status, error: exec2.json?.error, reasons: exec2.json?.reasons },
        };
      }
    } else {
      report.reset.evidence.superAdminLogin = "failed";
    }
  }

  // ── Action Center + Bell ────────────────────────────────────────
  const bell = await apiJson(cookie, "GET", "/api/admin/admin-bell");
  const overview = await apiJson(cookie, "GET", "/api/admin/customer-platform/overview");

  let browser;
  let context;
  let page;
  const tablet = {
    actionCenter: null,
    adsHub: null,
    placementMap: null,
    finance: null,
  };

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: 1,
    });
    await context.addCookies(authCookies(login.session));
    page = await context.newPage();

    await page.goto(`${ORIGIN}/admin#action-center`, { waitUntil: "domcontentloaded", timeout: 90000 });
    try {
      await page.waitForSelector("[data-admin-action-center]", { timeout: 20000 });
    } catch {
      /* continue — record absent */
    }
    await page.waitForTimeout(1200);
    await shot(page, "cut-i-admin-action-center-1024.png");

    const acUi = await page.evaluate(() => {
      const root = document.querySelector("[data-admin-action-center]");
      const totalEl = document.querySelector("[data-admin-action-center-total]");
      const cards = [...document.querySelectorAll("[data-admin-action-center-card]")].map((el) => ({
        id: el.getAttribute("data-admin-action-center-card"),
        count: el.getAttribute("data-count"),
      }));
      return {
        present: Boolean(root),
        totalText: totalEl ? (totalEl.textContent || "").trim().slice(0, 120) : null,
        cards,
      };
    });
    tablet.actionCenter = await measureOverflow(page);

    const bellTotal = bell.ok ? bell.json?.total : null;
    let bellCompare = "NOT_PROVEN";
    if (bell.ok && acUi.present) {
      const uiHasTotal = typeof acUi.totalText === "string" && /\d/.test(acUi.totalText);
      bellCompare = uiHasTotal ? "PARTIAL" : "PARTIAL";
    }
    report.actionCenterBell = verdict(acUi.present && bell.ok ? "PARTIAL" : acUi.present || bell.ok ? "PARTIAL" : "FAIL", {
      ui: acUi,
      bellApi: { status: bell.status, total: bellTotal, by_category: bell.json?.by_category ?? null },
      overviewApi: { status: overview.status, ok: overview.ok },
      bellCompare,
      note: "Counts recorded when present; semantic parity claimed only with matching evidence.",
    });
    report.matrix.actionCenterBell = report.actionCenterBell.status;

    // ── Placement Map + SEARCH_TOP ────────────────────────────────
    await page.goto(`${ORIGIN}/admin/delivery-ads/inventory#placement-map`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(2500);
    await shot(page, "cut-i-placement-map-1024.png");
    tablet.placementMap = await measureOverflow(page);

    const placementUi = await page.evaluate(() => {
      const panel = document.querySelector("[data-admin-placement-map]");
      const searchMarker =
        document.querySelector('[data-admin-placement-marker="STORES_SEARCH_TOP"]') ||
        [...document.querySelectorAll("[data-admin-placement-marker]")].find((el) =>
          /SEARCH_TOP/i.test(el.getAttribute("data-admin-placement-marker") || "")
        ) ||
        [...document.querySelectorAll("[data-sellable]")].find((el) =>
          /STORES_SEARCH_TOP|SEARCH_TOP/i.test(el.textContent || "")
        );
      const rows = [...document.querySelectorAll("[data-admin-placement-marker],[data-sellable]")].map((el) => ({
        marker: el.getAttribute("data-admin-placement-marker"),
        sellable: el.getAttribute("data-sellable"),
        domain: el.getAttribute("data-placement-domain"),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      }));
      return {
        panelPresent: Boolean(panel),
        rowCount: rows.length,
        searchTopSellable: searchMarker?.getAttribute("data-sellable") ?? null,
        searchTopMarker: searchMarker?.getAttribute("data-admin-placement-marker") ?? null,
        sampleRows: rows.slice(0, 8),
      };
    });

    const searchTopOk =
      placementUi.panelPresent &&
      (placementUi.searchTopSellable === "0" ||
        placementUi.sampleRows.some((r) => r.sellable === "0" && /SEARCH|TOP/i.test(r.text)));
    report.searchTop = verdict(searchTopOk ? "PASS" : placementUi.panelPresent ? "PARTIAL" : "FAIL", {
      ...placementUi,
      expected: "SEARCH_TOP data-sellable=0",
    });
    report.matrix.searchTop = report.searchTop.status;

    // Placement ACTIVE focus (optional campaign)
    const focusPlacement =
      (process.env.CUT_I_FOCUS_PLACEMENT || "").trim() || "STORES_SEARCH_TOP";
    if (CAMPAIGN_ID) {
      await page.goto(
        `${ORIGIN}/admin/delivery-ads/inventory?focus=${encodeURIComponent(focusPlacement)}&execution=${encodeURIComponent(CAMPAIGN_ID)}#placement-map`,
        { waitUntil: "domcontentloaded", timeout: 90000 }
      );
      await page.waitForTimeout(2500);
      await shot(page, "cut-i-placement-active-focus-1024.png");
      const activeUi = await page.evaluate(() => ({
        active: Boolean(document.querySelector("[data-admin-placement-map-active]")),
        error: Boolean(document.querySelector("[data-admin-placement-map-active-error]")),
        panel: Boolean(document.querySelector("[data-admin-placement-map]")),
      }));
      report.placementActive = verdict(
        activeUi.active && !activeUi.error ? "PARTIAL" : activeUi.panel ? "PARTIAL" : "NOT_PROVEN",
        {
          campaignId: CAMPAIGN_ID,
          ...activeUi,
          note:
            "Execution panel wire proven when markers present. Full ACTIVE lifecycle + app exposure remains separate — not elevated to PASS from panel alone.",
        }
      );
    } else {
      report.placementActive = verdict("NOT_PROVEN", {
        reason: "CUT_I_CAMPAIGN_ID not set — ACTIVE focus path not exercised",
      });
    }
    report.matrix.placementActive = report.placementActive.status;

    // ── Ads hub tablet + list ─────────────────────────────────────
    await page.goto(`${ORIGIN}/admin/delivery-ads`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);
    await shot(page, "cut-i-ads-hub-1024.png");
    tablet.adsHub = await measureOverflow(page);

    // ── Finance route smoke + tablet ──────────────────────────────
    const financePaths = ["/admin/store-finance", "/admin/business", "/admin/business-cash-charges"];
    let financeReached = false;
    for (const fp of financePaths) {
      const res = await page.goto(`${ORIGIN}${fp}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(1200);
      if (res && res.status() < 500) {
        financeReached = true;
        tablet.finance = await measureOverflow(page);
        await shot(page, "cut-i-finance-1024.png");
        break;
      }
    }

    // Navigation memory: ads detail → back toward map
    if (CAMPAIGN_ID) {
      await page.goto(`${ORIGIN}/admin/delivery-ads/${encodeURIComponent(CAMPAIGN_ID)}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForTimeout(1500);
      const focusNav =
        (process.env.CUT_I_FOCUS_PLACEMENT || "").trim() || "STORES_SEARCH_TOP";
      await page.goto(
        `${ORIGIN}/admin/delivery-ads/inventory?focus=${encodeURIComponent(focusNav)}&execution=${encodeURIComponent(CAMPAIGN_ID)}#placement-map`,
        { waitUntil: "domcontentloaded", timeout: 90000 }
      );
      await page.waitForTimeout(1200);
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
      await page.waitForTimeout(1000);
      const afterBack = page.url();
      report.navigation = verdict(/delivery-ads/i.test(afterBack) ? "PARTIAL" : "NOT_PROVEN", {
        afterBack,
        campaignId: CAMPAIGN_ID,
        note: "Browser back after map navigation; not full product memory contract proof.",
      });
    } else {
      report.navigation = verdict("NOT_PROVEN", { reason: "no CUT_I_CAMPAIGN_ID for back navigation" });
    }
    report.matrix.navigation = report.navigation.status;
  } finally {
    await browser?.close().catch(() => {});
  }

  const overflowAny = Object.values(tablet).some((g) => g?.pageOverflowX);
  report.tabletBrowser = verdict(
    Object.values(tablet).every((g) => g == null)
      ? "NOT_PROVEN"
      : overflowAny
        ? "FAIL"
        : "PASS",
    { viewport: VIEWPORT, surfaces: tablet, note: "1024×768 clientWidth/scrollWidth overflow check" }
  );
  report.matrix.tabletBrowser = report.tabletBrowser.status;

  // ── Finance APIs (safe: list pending; approve only clear QA) ────
  const pointCharges = await apiJson(cookie, "GET", `/api/admin/store-point-charges?storeId=${STORE_ID}`);
  const cashCharges = await apiJson(cookie, "GET", "/api/admin/business-cash-charges");
  const pendingPoint = Array.isArray(pointCharges.json?.requests || pointCharges.json?.items)
    ? (pointCharges.json.requests || pointCharges.json.items).filter((r) =>
        /pending|requested|submitted/i.test(String(r.status || r.request_status || ""))
      )
    : [];
  const cashItems = cashCharges.json?.requests || cashCharges.json?.items || cashCharges.json?.charges || [];
  const pendingCash = Array.isArray(cashItems)
    ? cashItems.filter((r) => /pending|requested|submitted/i.test(String(r.status || r.request_status || "")))
    : [];

  let financeStatus = "NOT_PROVEN";
  let financeNote = "Listed APIs when reachable; no unsafe approve of non-QA customer data.";
  if (pointCharges.ok || cashCharges.ok) {
    const qaPending = [...pendingPoint, ...pendingCash].filter((r) => {
      const sid = String(r.store_id || r.storeId || "");
      return sid === STORE_ID;
    });
    if (qaPending.length === 0) {
      financeStatus = "NOT_PROVEN";
      financeNote = "No safe QA-store pending charge found to approve; list endpoints probed.";
    } else {
      financeStatus = "PARTIAL";
      financeNote = `Found ${qaPending.length} QA-store pending item(s); approve skipped unless CUT_I_APPROVE_FINANCE=1.`;
      if (process.env.CUT_I_APPROVE_FINANCE === "1") {
        financeNote += " CUT_I_APPROVE_FINANCE=1 set but auto-approve not implemented in this close script (safety).";
      }
    }
  }
  report.finance = verdict(financeStatus, {
    pointCharges: { status: pointCharges.status, ok: pointCharges.ok, pendingCount: pendingPoint.length },
    cashCharges: { status: cashCharges.status, ok: cashCharges.ok, pendingCount: pendingCash.length },
    note: financeNote,
  });
  report.matrix.finance = report.finance.status;

  // ── Sale recognition (runtime probe — env alone ≠ PASS) ─────────
  let sale = {
    envFlagLocal: process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE || null,
    note: "Local env flag is not Production runtime proof.",
  };
  let saleStatus = "NOT_PROVEN";
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (sk && url) {
    const sb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: orders, error: ordErr } = await sb
      .from("store_orders")
      .select("id, order_status, payment_status, payment_amount, store_id, updated_at, created_at")
      .eq("store_id", STORE_ID)
      .eq("order_status", "completed")
      .order("updated_at", { ascending: false })
      .limit(3);
    sale.recentCompletedOrders = ordErr
      ? { error: ordErr.message }
      : (orders || []).map((o) => ({
          id: o.id,
          order_status: o.order_status,
          payment_status: o.payment_status,
          payment_amount: o.payment_amount,
          updated_at: o.updated_at,
        }));
    const orderId = orders?.[0]?.id;
    if (orderId) {
      // Probe coin credit tables used by currency writers (names may vary)
      const ledgerTables = [
        "store_coin_ledger_entries",
        "store_business_coin_ledger",
        "business_cash_ledger",
        "store_economic_point_ledger",
        "store_point_ledger",
      ];
      const ledgerProbe = [];
      for (const table of ledgerTables) {
        const { data, error } = await sb
          .from(table)
          .select("*")
          .or(`order_id.eq.${orderId},ref_id.eq.${orderId},source_id.eq.${orderId}`)
          .limit(5);
        if (!error) {
          ledgerProbe.push({ table, rows: data || [], ok: true });
        } else {
          // try store_id only
          const { data: d2, error: e2 } = await sb
            .from(table)
            .select("*")
            .eq("store_id", STORE_ID)
            .limit(3);
          ledgerProbe.push({
            table,
            ok: !e2,
            error: error.message,
            storeRows: e2 ? null : d2,
            storeError: e2?.message || null,
          });
        }
      }
      const anyOrderLinked = ledgerProbe.some((p) => p.rows && p.rows.length > 0);
      const anyStoreLedger = ledgerProbe.some((p) => p.ok && p.storeRows && p.storeRows.length > 0);
      sale.coinLedger = ledgerProbe;
      if (anyOrderLinked) {
        saleStatus = "PARTIAL";
        sale.note =
          "Completed QA order has order-linked ledger rows — still need effective LIVE flag + complete→credit chain proof.";
      } else if (anyStoreLedger) {
        saleStatus = "NOT_PROVEN";
        sale.note =
          "Store has cash/coin ledger rows but none order-linked in this probe — Coin sale recognition LIVE not proven.";
      } else {
        saleStatus = "NOT_PROVEN";
        sale.note = "Completed QA order found but no matching coin ledger rows in probed tables.";
      }
    } else {
      saleStatus = "NOT_PROVEN";
      sale.note = "No recent completed QA-store order for sale-recognition probe.";
    }
  } else {
    sale.note = "Missing service role — cannot query Production DB for sale recognition.";
  }
  // Optional admin UI/API surface
  const salePage = await apiJson(cookie, "GET", "/api/admin/commerce-settings").catch(() => ({
    status: 0,
    ok: false,
  }));
  sale.commerceSettingsProbe = { status: salePage.status, ok: salePage.ok };
  report.saleRecognition = verdict(saleStatus, sale);
  report.matrix.saleRecognition = report.saleRecognition.status;

  // ── Delivery ads list / pause-resume-end ────────────────────────
  const adsList = await apiJson(
    cookie,
    "GET",
    `/api/admin/delivery-ads?storeId=${STORE_ID}&bucket=active&limit=50`
  );
  const campaigns = Array.isArray(adsList.json?.campaigns) ? adsList.json.campaigns : [];
  const active = campaigns.filter((c) => /active/i.test(String(c.lifecycleStatus || c.status || "")));
  report.ads = verdict(adsList.ok ? (active.length ? "PASS" : "PARTIAL") : "FAIL", {
    status: adsList.status,
    ok: adsList.ok,
    activeCount: active.length,
    sample: campaigns.slice(0, 5).map((c) => ({
      id: c.id || c.campaignId,
      lifecycle: c.lifecycleStatus || c.status,
      storeId: c.storeId || c.store_id,
      productKind: c.productKind || c.product_kind,
    })),
  });
  report.matrix.ads = report.ads.status;

  if (!ALLOW_ADS_MUTATION) {
    report.pauseResumeEnd = verdict("NOT_PROVEN", {
      reason: "CUT_I_ALLOW_ADS_MUTATION!=1 — pause/resume/end not attempted",
    });
  } else {
    const qaCamp =
      campaigns.find((c) => String(c.id || c.campaignId) === CAMPAIGN_ID) ||
      active.find((c) => String(c.storeId || c.store_id) === STORE_ID);
    if (!qaCamp) {
      report.pauseResumeEnd = verdict("BLOCKED", { reason: "no clearly QA campaign for mutation" });
    } else {
      const cid = qaCamp.id || qaCamp.campaignId;
      const productKind = qaCamp.productKind || qaCamp.product_kind || "banner";
      const expectedLifecycle = qaCamp.lifecycleStatus || qaCamp.status;
      const expectedUpdatedAt = qaCamp.updatedAt || qaCamp.updated_at;
      const pause = await apiJson(cookie, "POST", `/api/admin/delivery-ads/${cid}/actions`, {
        productKind,
        action: "pause",
        expectedLifecycle,
        expectedUpdatedAt,
        reason: "CUT_I_QA_pause",
      });
      report.pauseResumeEnd = verdict(pause.ok ? "PARTIAL" : "FAIL", {
        campaignId: cid,
        pause: { status: pause.status, ok: pause.ok, json: pause.json },
        note: "Only pause attempted when ALLOW set; resume/end left for explicit follow-up to avoid leaving campaign ended.",
      });
    }
  }
  report.matrix.pauseResumeEnd = report.pauseResumeEnd.status;

  // Creative parity — smoke only unless campaign focus
  if (CAMPAIGN_ID) {
    const detail = await apiJson(cookie, "GET", `/api/admin/delivery-ads/${CAMPAIGN_ID}`);
    report.creativeParity = verdict(detail.ok ? "PARTIAL" : "NOT_PROVEN", {
      status: detail.status,
      hasCreative: Boolean(detail.json?.campaign?.creative || detail.json?.creative),
      note: "Detail fetch only — not pixel/creative side-by-side PASS.",
    });
  } else {
    report.creativeParity = verdict("NOT_PROVEN", { reason: "no CUT_I_CAMPAIGN_ID" });
  }
  report.matrix.creativeParity = report.creativeParity.status;

  // Support / Partner / Popup / Feed — route/API smoke; mutate only with safe env IDs
  async function smokeGet(path) {
    return apiJson(cookie, "GET", path);
  }
  const supportSmoke = await smokeGet("/api/admin/platform-inquiries?limit=5").catch(() =>
    smokeGet("/api/admin/support/summary")
  );
  const partnerSmoke = await smokeGet("/api/admin/delivery-ads/partner/memberships");
  const popupSmoke = await smokeGet("/api/admin/popups").catch(() => ({ status: 0, ok: false }));
  // try alternate popup path
  const popupAlt = popupSmoke.ok ? popupSmoke : await smokeGet("/api/admin/banners");
  const feedSmoke = await smokeGet("/api/admin/feed-ads");

  report.support = verdict(
    supportSmoke.ok
      ? process.env.CUT_I_SUPPORT_ID
        ? "PARTIAL"
        : "PARTIAL"
      : "NOT_PROVEN",
    {
      api: { status: supportSmoke.status, ok: supportSmoke.ok },
      mutation: process.env.CUT_I_SUPPORT_ID
        ? "env_id_present_but_mutation_not_auto_run"
        : "no_safe_id",
    }
  );
  report.partner = verdict(partnerSmoke.ok ? "PARTIAL" : "NOT_PROVEN", {
    api: { status: partnerSmoke.status, ok: partnerSmoke.ok },
    mutation: process.env.CUT_I_PARTNER_ID ? "env_id_present_but_mutation_not_auto_run" : "no_safe_id",
  });
  report.popup = verdict(popupAlt.ok ? "PARTIAL" : "NOT_PROVEN", {
    api: { status: popupAlt.status, ok: popupAlt.ok },
    mutation: process.env.CUT_I_POPUP_ID ? "env_id_present_but_mutation_not_auto_run" : "no_safe_id",
  });
  report.feed = verdict(feedSmoke.ok ? "PARTIAL" : "NOT_PROVEN", {
    api: { status: feedSmoke.status, ok: feedSmoke.ok },
    mutation: process.env.CUT_I_FEED_ID ? "env_id_present_but_mutation_not_auto_run" : "no_safe_id",
  });
  report.matrix.support = report.support.status;
  report.matrix.partner = report.partner.status;
  report.matrix.popup = report.popup.status;
  report.matrix.feed = report.feed.status;

  // Failure paths summary — hard FAIL only (BLOCKED ≠ product FAIL)
  const hardFails = Object.entries(report.matrix).filter(([, v]) => v === "FAIL");
  const blocked = Object.entries(report.matrix).filter(([, v]) => v === "BLOCKED");
  report.failurePaths = verdict(hardFails.length ? "FAIL" : "PASS", {
    failedKeys: hardFails.map(([k, v]) => ({ key: k, status: v })),
    blockedKeys: blocked.map(([k, v]) => ({ key: k, status: v })),
    note: "Aggregated hard FAIL keys only — BLOCKED means proof unavailable, not product regression.",
  });
  report.matrix.failurePaths = report.failurePaths.status;

  report.remaining = [
    report.placementActive.status === "NOT_PROVEN" ? "Placement ACTIVE live focus (set CUT_I_CAMPAIGN_ID)" : null,
    report.pauseResumeEnd.status === "NOT_PROVEN" ? "Ads pause/resume/end (CUT_I_ALLOW_ADS_MUTATION=1 + QA campaign)" : null,
    report.finance.status === "NOT_PROVEN" ? "Finance approve on safe QA pending" : null,
    report.saleRecognition.status !== "PASS" ? "Sale recognition full Production LIVE proof" : null,
    report.creativeParity.status === "NOT_PROVEN" ? "Creative parity live compare" : null,
    report.reset.status === "BLOCKED" ? "Reset dry-run env gate needs super_admin session proof" : null,
    "Support/Partner/Popup/Feed live mutations",
    "Never claim PRODUCT READY from this close alone",
  ].filter(Boolean);

  const statuses = Object.values(report.matrix);
  const anyHardFail = statuses.some((s) => s === "FAIL");
  const allPass = statuses.length > 0 && statuses.every((s) => s === "PASS");
  report.finalVerdicts = {
    productReady: "NOT_CLAIMED",
    cutIClose: anyHardFail ? "FAIL" : allPass ? "PARTIAL" : "PARTIAL",
    note: allPass
      ? "All probed keys PASS but PRODUCT READY is still NOT_CLAIMED (bounded close)."
      : "PARTIAL/NOT_PROVEN/BLOCKED remaining — honest close, not PRODUCT READY PASS.",
    matrixSummary: report.matrix,
  };
  report.finishedAt = new Date().toISOString();
  report.loginMethod = login.method;

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        reportPath: REPORT_JSON,
        matrix: report.matrix,
        finalVerdicts: report.finalVerdicts,
        remaining: report.remaining,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
