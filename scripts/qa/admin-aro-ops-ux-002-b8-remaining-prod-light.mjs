#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B8 Remaining — Production light (read-only).
 * R1 modal footer + U3 Trade / U4 Community / U8 Chat visual proof.
 * Open confirm/prompt → measure geometry → Cancel only. No destructive mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b8-remaining");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B8R_EXPECT_SHA || "").slice(0, 9);

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

async function geometry(page) {
  return page.evaluate(() => {
    const body = document.body;
    const panel = document.querySelector("[data-dibay-dialog-panel='1'], .dibay-overlay-dialog");
    const actions = document.querySelector(".dibay-overlay-actions");
    const sticky = document.querySelector(
      "[data-admin-table-bottom-hscroll], [data-admin-posts-mgmt-bottom-hscroll]"
    );
    const pr = panel?.getBoundingClientRect();
    const ar = actions?.getBoundingClientRect();
    const sr = sticky?.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const footerVisible =
      !!ar && ar.height > 0 && ar.top >= 0 && ar.bottom <= vh + 1 && ar.left >= 0 && ar.right <= vw + 1;
    const stickyVisible = !!sr && sr.height > 0 && getComputedStyle(sticky).visibility !== "hidden";
    const overlap =
      !!ar &&
      stickyVisible &&
      !(ar.bottom <= sr.top || ar.top >= sr.bottom || ar.right <= sr.left || ar.left >= sr.right);
    return {
      viewport: { w: vw, h: vh },
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyX: body.scrollWidth > body.clientWidth + 1,
      modalRect: pr
        ? { top: pr.top, left: pr.left, bottom: pr.bottom, right: pr.right, w: pr.width, h: pr.height }
        : null,
      footerRect: ar
        ? { top: ar.top, left: ar.left, bottom: ar.bottom, right: ar.right, w: ar.width, h: ar.height }
        : null,
      stickyRect: stickyVisible
        ? { top: sr.top, left: sr.left, bottom: sr.bottom, right: sr.right, w: sr.width, h: sr.height }
        : null,
      footerVisible,
      stickyVisible,
      bottomObstruction: overlap,
      overlayOpen: !!document.querySelector(".dibay-overlay-root"),
    };
  });
}

async function selectFirstRow(page) {
  const cb = page.locator('[data-admin-mgmt-surface] input[type="checkbox"], [data-admin-mgmt-selection] input, table input[type="checkbox"]').nth(1);
  if ((await cb.count()) === 0) {
    const any = page.locator("table tbody input[type='checkbox']").first();
    if ((await any.count()) === 0) return false;
    await any.check({ force: true }).catch(() => any.click({ force: true }));
    return true;
  }
  await cb.check({ force: true }).catch(() => cb.click({ force: true }));
  return true;
}

async function openHardConfirmAndCancel(page, hardSelector) {
  const hard = page.locator(hardSelector).first();
  if ((await hard.count()) === 0) return { opened: false, reason: "hard_cta_missing" };
  const disabled = await hard.isDisabled().catch(() => true);
  if (disabled) {
    // select a row then retry
    await selectFirstRow(page);
    await page.waitForTimeout(200);
  }
  if (await hard.isDisabled().catch(() => true)) {
    return { opened: false, reason: "hard_cta_disabled" };
  }
  await hard.click();
  await page.waitForSelector(".dibay-overlay-root", { timeout: 8000 });
  const g = await geometry(page);
  const shot = await page.screenshot({ fullPage: false });
  // Cancel — never confirm destructive
  const cancel = page.locator(".dibay-overlay-btn--secondary").first();
  if ((await cancel.count()) > 0) await cancel.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { opened: true, geometry: g, shot };
}

async function openSoftConfirmAndCancel(page, softSelector) {
  const soft = page.locator(softSelector).first();
  if ((await soft.count()) === 0) return { opened: false, reason: "soft_cta_missing" };
  await selectFirstRow(page);
  await page.waitForTimeout(200);
  if (await soft.isDisabled().catch(() => true)) return { opened: false, reason: "soft_cta_disabled" };
  await soft.click();
  await page.waitForSelector(".dibay-overlay-root", { timeout: 8000 }).catch(() => null);
  if (!(await page.locator(".dibay-overlay-root").count())) {
    return { opened: false, reason: "no_overlay" };
  }
  const g = await geometry(page);
  const cancel = page.locator(".dibay-overlay-btn--secondary").first();
  if ((await cancel.count()) > 0) await cancel.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { opened: true, geometry: g };
}

async function pageBase(page, path, shotName) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1200);
  const g = await geometry(page);
  await page.screenshot({ path: resolve(OUT, shotName), fullPage: false });
  const soft = await page.locator('[data-admin-mgmt-bulk-action="soft_delete"], [data-admin-mgmt-bulk-action="hide"], [data-admin-mgmt-bulk-action="hide_list"]').count();
  const hard = await page.locator('[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]').count();
  return { path, geometry: g, softCtaCount: soft, hardCtaCount: hard };
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  const login = await loginSession(EMAIL);
  if (!login?.session) {
    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: "login_failed" }, null, 2));
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addCookies(authCookies(login.session, activeSessionId));
  const page = await context.newPage();

  const report = {
    ok: false,
    origin: ORIGIN,
    expectSha: EXPECT_SHA || null,
    mutation: "NONE",
    surfaces: {},
  };

  try {
    // U3 Trade
    const u3 = await pageBase(page, "/admin/posts-management?tab=trade", "u3-trade-base-1024x768.png");
    await selectFirstRow(page);
    await page.waitForTimeout(300);
    const u3Hard = await openHardConfirmAndCancel(page, '[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]');
    if (u3Hard.shot) writeFileSync(resolve(OUT, "u3-trade-hard-confirm-1024x768.png"), u3Hard.shot);
    report.surfaces.U3_TRADE = {
      ...u3,
      hardConfirm: u3Hard.opened ? { opened: true, geometry: u3Hard.geometry } : u3Hard,
      pass:
        !u3.geometry.bodyX &&
        u3Hard.opened === true &&
        u3Hard.geometry?.footerVisible === true &&
        u3Hard.geometry?.bottomObstruction === false,
    };

    // U4 Community posts
    const u4 = await pageBase(page, "/admin/community/posts", "u4-community-base-1024x768.png");
    await selectFirstRow(page);
    await page.waitForTimeout(300);
    const u4Soft = await openSoftConfirmAndCancel(page, '[data-admin-mgmt-bulk-action="soft_delete"]');
    const u4Hard = await openHardConfirmAndCancel(page, '[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]');
    if (u4Hard.shot) writeFileSync(resolve(OUT, "u4-community-hard-confirm-1024x768.png"), u4Hard.shot);
    report.surfaces.U4_COMMUNITY = {
      ...u4,
      softConfirm: u4Soft,
      hardConfirm: u4Hard.opened ? { opened: true, geometry: u4Hard.geometry } : u4Hard,
      pass:
        !u4.geometry.bodyX &&
        (u4Soft.opened === true || u4Hard.opened === true) &&
        ((u4Hard.geometry?.footerVisible ?? u4Soft.geometry?.footerVisible) === true) &&
        ((u4Hard.geometry?.bottomObstruction ?? u4Soft.geometry?.bottomObstruction) === false),
    };

    // U8 Chat — all (hide/hard) + trade (ops + hard)
    const u8a = await pageBase(page, "/admin/chats", "u8-chat-all-base-1024x768.png");
    await selectFirstRow(page);
    await page.waitForTimeout(300);
    const hideVisible = (await page.locator('[data-admin-mgmt-bulk-action="hide_list"]').count()) > 0;
    const hardVisible = (await page.locator('[data-admin-mgmt-hard-delete="1"]').count()) > 0;
    const u8Hard = await openHardConfirmAndCancel(page, '[data-admin-mgmt-hard-delete="1"]');
    if (u8Hard.shot) writeFileSync(resolve(OUT, "u8-chat-hard-confirm-1024x768.png"), u8Hard.shot);
    const u8b = await pageBase(page, "/admin/chats/trade", "u8-chat-trade-base-1024x768.png");
    report.surfaces.U8_CHAT = {
      all: u8a,
      trade: u8b,
      hideVisible,
      hardVisible,
      hardConfirm: u8Hard.opened ? { opened: true, geometry: u8Hard.geometry } : u8Hard,
      pass:
        !u8a.geometry.bodyX &&
        !u8b.geometry.bodyX &&
        hideVisible &&
        hardVisible &&
        u8Hard.opened === true &&
        u8Hard.geometry?.footerVisible === true &&
        u8Hard.geometry?.bottomObstruction === false,
    };

    // R1 aggregate
    const modalProofs = [u3Hard, u4Hard, u8Hard].filter((x) => x.opened);
    report.R1 = {
      modalOwner: "dibay-overlay / DibayDialog",
      proofs: modalProofs.length,
      footerVisible: modalProofs.every((x) => x.geometry?.footerVisible),
      bottomObstruction: modalProofs.some((x) => x.geometry?.bottomObstruction),
      pass: modalProofs.length >= 2 && modalProofs.every((x) => x.geometry?.footerVisible && !x.geometry?.bottomObstruction),
    };

    // SHA probe
    let sha = null;
    try {
      const res = await page.goto(`${ORIGIN}/api/health`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const j = await res?.json().catch(() => null);
      sha = String(j?.gitSha || j?.sha || j?.commit || "").slice(0, 9) || null;
    } catch {
      sha = null;
    }
    report.productionShaProbe = sha;
    report.shaOk = !EXPECT_SHA || !sha || sha.startsWith(EXPECT_SHA);

    report.ok =
      report.R1.pass &&
      report.surfaces.U3_TRADE.pass &&
      report.surfaces.U4_COMMUNITY.pass &&
      report.surfaces.U8_CHAT.pass &&
      report.shaOk !== false;

    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, R1: report.R1.pass, U3: report.surfaces.U3_TRADE.pass, U4: report.surfaces.U4_COMMUNITY.pass, U8: report.surfaces.U8_CHAT.pass }, null, 2));
    await browser.close();
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    writeFileSync(resolve(OUT, "prod-light-report.json"), JSON.stringify({ ok: false, error: String(err), report }, null, 2));
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
