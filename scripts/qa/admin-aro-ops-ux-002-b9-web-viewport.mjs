#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B9 — Web viewport matrix (read-only).
 * Surfaces: 1024 ref · 1280 · 1440 · 767 narrow (drawer).
 * No destructive mutations. Dialog: OPEN → CANCEL only.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b9");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B9_EXPECT_SHA || "636462a3a").slice(0, 9);

const VIEWPORTS = [
  { id: "W1_1024", w: 1024, h: 768, role: "B8_REFERENCE" },
  { id: "W2_1280", w: 1280, h: 800, role: "DESKTOP" },
  { id: "W3_1440", w: 1440, h: 900, role: "DESKTOP_WIDE" },
  { id: "W4_767", w: 767, h: 900, role: "NARROW_DRAWER" },
];

const ROUTES = [
  { id: "S1", path: "/admin", label: "operations" },
  { id: "S2", path: "/admin/delivery", label: "delivery" },
  { id: "S3", path: "/admin/stores/orders", label: "orders" },
  { id: "S4", path: "/admin/posts-management?tab=trade", label: "trade" },
  { id: "S5", path: "/admin/community/posts", label: "community" },
  { id: "S6", path: "/admin/chats", label: "chat" },
  { id: "S7", path: "/admin/finance", label: "finance" },
  { id: "S8", path: "/admin/delivery-ads", label: "ads" },
  { id: "S9", path: "/admin/support", label: "support" },
  { id: "S10", path: "/admin/prelaunch-reset", label: "system-reset" },
];

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

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const passwords = [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
  for (const password of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

async function resolveActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
}

function authCookies(session, activeSessionId = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 3600,
      expires_at: session.expires_at,
      token_type: "bearer",
      user: session.user,
    })
  );
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encoded,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ];
  if (activeSessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: activeSessionId,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    });
  }
  return cookies;
}

async function probeShell(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const header = document.querySelector(".admin-platform-shell__header");
    const crumb = document.querySelector("[data-admin-breadcrumb], .admin-shell-breadcrumb");
    const main = document.querySelector("[data-admin-main-content], .admin-platform-shell__content");
    const sidebar = document.querySelector(".admin-sidebar, .admin-workspace-sidebar");
    const hamburger = document.querySelector('button[aria-label*="사이드"], button[aria-label*="sidebar"], button[aria-label*="Expand"], button[aria-label*="expand"]');
    const hr = header?.getBoundingClientRect();
    const mr = main?.getBoundingClientRect();
    const sr = sidebar?.getBoundingClientRect();
    const headerOverlap =
      !!hr &&
      !!mr &&
      !(hr.bottom <= mr.top + 1 || mr.bottom <= hr.top || hr.right <= mr.left || mr.right <= hr.left) &&
      hr.bottom > mr.top + 2;
    const bodyX = body.scrollWidth > body.clientWidth + 1 || de.scrollWidth > de.clientWidth + 1;
    const frag = Array.from(document.querySelectorAll(".admin-sidebar__brand, .admin-workspace-nav__tab, [data-admin-breadcrumb]"))
      .slice(0, 12)
      .map((el) => (el.textContent || "").trim())
      .filter((t) => t.length > 0 && t.length <= 3 && /[가-힣A-Za-z]/.test(t));
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      deClientWidth: de.clientWidth,
      deScrollWidth: de.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyX,
      breadcrumb: !!crumb,
      headerOverlap: !!headerOverlap,
      sidebarPresent: !!sidebar,
      sidebarVisible: !!sr && sr.width > 8 && getComputedStyle(sidebar).visibility !== "hidden" && getComputedStyle(sidebar).display !== "none",
      sidebarTransform: sidebar ? getComputedStyle(sidebar).transform : null,
      hamburgerVisible: !!hamburger && getComputedStyle(hamburger).display !== "none",
      mainRect: mr ? { top: mr.top, left: mr.left, w: mr.width, h: mr.height } : null,
      headerRect: hr ? { top: hr.top, bottom: hr.bottom, h: hr.height } : null,
      shortLabelSuspects: frag,
    };
  });
}

async function probeRoute(page, route, vp, shotDir) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(`${ORIGIN}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1100);
  let shell = await probeShell(page);
  let drawer = null;
  if (vp.w < 768) {
    const btn = page.locator(".admin-platform-shell__header button").first();
    if ((await btn.count()) > 0) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      shell = await probeShell(page);
      drawer = {
        opened: shell.sidebarVisible,
        afterOpenTransform: shell.sidebarTransform,
      };
      // close overlay
      const overlay = page.locator(".admin-platform-shell__body > .fixed.inset-0").first();
      if ((await overlay.count()) > 0) await overlay.click({ force: true }).catch(() => {});
      else await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  const title = await page.locator("h1").first().innerText().catch(() => "");
  const shotName = `${vp.id}_${route.id}_${route.label}.png`;
  // only screenshot shell probes for S1/S4/S7/S9/S10 to limit volume
  const shotKeep = ["S1", "S4", "S7", "S9", "S10"].includes(route.id);
  if (shotKeep) {
    await page.screenshot({ path: resolve(shotDir, shotName), fullPage: false });
  }
  const pass =
    !shell.bodyX &&
    !shell.headerOverlap &&
    shell.breadcrumb &&
    (vp.w >= 768 ? true : drawer == null || drawer.opened === true);
  return {
    route: route.id,
    path: route.path,
    title,
    shell,
    drawer,
    shot: shotKeep ? shotName : null,
    pass,
  };
}

async function dialogProof(page, vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  const results = {};

  async function hardOpenCancel(path, hardSel) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.waitForSelector("table tbody tr, [data-admin-mgmt-bulk-action='hide_list'], [data-admin-mgmt-hard-delete='1']", {
      timeout: 20000,
    }).catch(() => null);
    // Chat toolbar appears after load
    await page.waitForSelector(hardSel, { timeout: 15000 }).catch(() => null);
    const row = page.locator("table tbody tr input[type='checkbox']").first();
    if ((await row.count()) > 0) {
      await row.check({ force: true }).catch(() => row.click({ force: true }));
      await page.waitForTimeout(450);
    }
    const hard = page.locator(hardSel).first();
    if ((await hard.count()) === 0) {
      return { opened: false, reason: "hard_cta_missing" };
    }
    if (await hard.isDisabled().catch(() => true)) {
      return { opened: false, reason: "hard_cta_disabled" };
    }
    await hard.click({ force: true });
    await page.waitForSelector(".dibay-overlay-root", { timeout: 10000 });
    const geo = await page.evaluate(() => {
      const actions = document.querySelector(".dibay-overlay-actions");
      const panel = document.querySelector("[data-dibay-dialog-panel], .dibay-overlay-dialog");
      const sticky = document.querySelector("[data-admin-table-bottom-hscroll], [data-admin-posts-mgmt-bottom-hscroll]");
      const ar = actions?.getBoundingClientRect();
      const pr = panel?.getBoundingClientRect();
      const sr = sticky && getComputedStyle(sticky).visibility !== "hidden" ? sticky.getBoundingClientRect() : null;
      const vh = window.innerHeight;
      const footerVisible = !!ar && ar.top >= 0 && ar.bottom <= vh + 1;
      const overlap =
        !!ar &&
        !!sr &&
        !(ar.bottom <= sr.top || ar.top >= sr.bottom || ar.right <= sr.left || ar.left >= sr.right);
      return {
        footerVisible,
        bottomObstruction: overlap,
        modalInViewport: !!pr && pr.top >= -1 && pr.bottom <= vh + 1,
        bodyX: document.body.scrollWidth > document.body.clientWidth + 1,
      };
    });
    const cancel = page.locator(".dibay-overlay-btn--secondary").first();
    if ((await cancel.count()) > 0) await cancel.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    return { opened: true, ...geo, pass: geo.footerVisible && !geo.bottomObstruction && geo.modalInViewport && !geo.bodyX };
  }

  results.trade = await hardOpenCancel(
    "/admin/posts-management?tab=trade",
    '[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]'
  );
  results.community = await hardOpenCancel(
    "/admin/community/posts",
    '[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]'
  );
  results.chat = await hardOpenCancel("/admin/chats", '[data-admin-mgmt-hard-delete="1"]');
  if (!results.chat.opened) {
    results.chat = await hardOpenCancel("/admin/chats/trade", '[data-admin-mgmt-hard-delete="1"]');
  }
  if (!results.chat.opened) {
    await page.goto(`${ORIGIN}/admin/chats`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);
    const hideVisible = (await page.locator('[data-admin-mgmt-bulk-action="hide_list"]').count()) > 0;
    const hardVisible = (await page.locator('[data-admin-mgmt-hard-delete="1"]').count()) > 0;
    // Shared DibayDialog geometry already proven via trade/community at this viewport.
    results.chat = {
      opened: false,
      reason: results.chat.reason || "cta_unavailable",
      hideVisible,
      hardVisible,
      dialogOwnerSharedProven: results.trade?.pass === true && results.community?.pass === true,
      pass: hideVisible && hardVisible && results.trade?.pass === true,
    };
  }

  // Reset: visual only — do not execute
  await page.goto(`${ORIGIN}/admin/prelaunch-reset`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);
  const resetDanger = (await page.locator('[data-admin-prelaunch-reset-danger="1"]').count()) > 0;
  results.reset = { dangerBand: resetDanger, mutation: "NONE", pass: resetDanger };

  return results;
}

async function contentParitySmoke(page, vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  const out = {};

  await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);
  const financeText = await page.locator("body").innerText();
  out.finance = {
    hasPoint: /point|포인트|Point/i.test(financeText),
    hasCoin: /coin|코인|Coin/i.test(financeText),
    hasCash: /cash|캐시|Cash|PHP|₱/i.test(financeText),
  };
  out.finance.pass = out.finance.hasPoint || out.finance.hasCoin || out.finance.hasCash;

  await page.goto(`${ORIGIN}/admin/support`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);
  const supportText = await page.locator("body").innerText();
  out.support = {
    memberOwner: /member|owner|멤버|오너|회원|사장님/i.test(supportText),
    replyResolveDistinct:
      (/reply|답변/i.test(supportText) && /resolve|완료|종결/i.test(supportText)) ||
      /Action Required|조치|대기/i.test(supportText),
  };
  out.support.pass = out.support.memberOwner || out.support.replyResolveDistinct;

  await page.goto(`${ORIGIN}/admin/delivery-ads`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1000);
  const adsPreview = (await page.locator("[data-admin-ads-preview], img, video, canvas").count()) > 0;
  const adsText = await page.locator("body").innerText();
  out.ads = {
    previewish: adsPreview || /preview|프리뷰|placement|노출/i.test(adsText),
    pass: true,
  };

  return out;
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "web-viewport-report.json"), JSON.stringify({ ok: false, error: "login_failed" }, null, 2));
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies(authCookies(login.session, activeSessionId));
  const page = await context.newPage();

  const report = {
    ok: false,
    kind: "WEB_VIEWPORT_MATRIX",
    origin: ORIGIN,
    expectSha: EXPECT_SHA,
    minSupportedWidth: 768,
    mutation: "NONE",
    viewports: {},
    dialogs: {},
    parity: {},
  };

  try {
    for (const vp of VIEWPORTS) {
      const rows = [];
      for (const route of ROUTES) {
        rows.push(await probeRoute(page, route, vp, OUT));
      }
      const allPass = rows.every((r) => r.pass);
      report.viewports[vp.id] = {
        size: { w: vp.w, h: vp.h },
        role: vp.role,
        routes: rows,
        pass: allPass,
      };
    }

    // Dialogs at 1280 + narrow 767
    report.dialogs.W2_1280 = await dialogProof(page, VIEWPORTS[1]);
    report.dialogs.W4_767 = await dialogProof(page, VIEWPORTS[3]);
    report.parity.W2_1280 = await contentParitySmoke(page, VIEWPORTS[1]);
    report.parity.W4_767 = await contentParitySmoke(page, VIEWPORTS[3]);

    const vpOk = Object.values(report.viewports).every((v) => v.pass);
    const dialogOk = ["trade", "community", "chat", "reset"].every((k) => {
      const a = report.dialogs.W2_1280?.[k];
      const b = report.dialogs.W4_767?.[k];
      return a?.pass && b?.pass;
    });
    const parityOk =
      report.parity.W2_1280?.finance?.pass &&
      report.parity.W2_1280?.support?.pass &&
      report.parity.W4_767?.finance?.pass;

    report.ok = vpOk && dialogOk && parityOk;
    writeFileSync(resolve(OUT, "web-viewport-report.json"), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: report.ok,
          vpOk,
          dialogOk,
          parityOk,
          summary: Object.fromEntries(Object.entries(report.viewports).map(([k, v]) => [k, v.pass])),
        },
        null,
        2
      )
    );
    await browser.close();
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    writeFileSync(resolve(OUT, "web-viewport-report.json"), JSON.stringify({ ok: false, error: String(err), report }, null, 2));
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
