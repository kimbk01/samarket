#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B1 — Production light (non-destructive).
 * Trade soft terminology + Community soft/hard bulk visibility @ 1024×768.
 * Does NOT execute DB permanent delete.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b1");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B1_EXPECT_SHA || "1a4d80d45").slice(0, 9);

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of passwords()) {
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
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({ ...base, name: "samarket_signup_locale", value: "ko" });
  if (activeSessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: encodeURIComponent(String(activeSessionId)),
    });
  }
  return cookies;
}

function geometryOk(pageEval) {
  return pageEval.bodyScrollWidth <= pageEval.bodyClientWidth + 1;
}

async function probeTrade(page) {
  await page.goto(`${ORIGIN}/admin/posts-management`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-aro-ops-ux-001-w1='1']", { timeout: 90000 });
  await page.waitForTimeout(1500);

  const geo = await page.evaluate(() => {
    const body = document.body;
    const text = body.innerText || "";
    return {
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      hasSoftStatus: text.includes("삭제(상태)"),
      hasSoftLegacy: text.includes("(soft)") || text.includes("소프트 삭제"),
      hasHardCta: /DB 영구 삭제/.test(text) && !/NOT_READY/.test(text),
      hasNotReadyHard: text.includes("NOT_READY"),
    };
  });

  // Select one row if possible — soft only in bulk bar
  let bulk = null;
  const rowSelect = page.locator("[data-admin-mgmt-row-select='1']").first();
  if (await rowSelect.count()) {
    await rowSelect.click({ force: true });
    await page.waitForTimeout(400);
    bulk = await page.evaluate(() => {
      const bar = document.querySelector("[data-admin-mgmt-bulk-bar='1']");
      const t = bar ? bar.textContent || "" : "";
      return {
        visible: !!bar,
        text: t,
        hasSoft: t.includes("삭제(상태)"),
        hasHard: t.includes("DB 영구 삭제"),
        hardAttr: !!document.querySelector("[data-admin-mgmt-hard-delete='1']"),
      };
    });
  }

  // Open soft delete confirm (cancel) — no mutation commit required beyond cancel
  let softModal = null;
  const softBtn = page.getByRole("button", { name: /삭제\(상태\)/ }).first();
  if ((await softBtn.count()) && bulk?.visible) {
    await softBtn.click({ force: true });
    await page.waitForTimeout(600);
    softModal = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"], [data-dibay-overlay]');
      const root = dlg || document.body;
      const t = root.innerText || "";
      const box = dlg ? dlg.getBoundingClientRect() : null;
      return {
        text: t.slice(0, 800),
        saysNotPermanent: t.includes("DB 영구 삭제 아님") || t.includes("DB 영구 삭제가 아닙니다"),
        saysStatusDeleted: t.includes("status=deleted"),
        fits:
          !box ||
          (box.top >= -2 &&
            box.left >= -2 &&
            box.bottom <= window.innerHeight + 2 &&
            box.right <= window.innerWidth + 2),
      };
    });
    const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
    if (await cancel.count()) await cancel.click({ force: true });
  }

  await page.screenshot({ path: resolve(OUT, "prod-trade-posts-b1.png"), fullPage: true });

  const checks = {
    bodyNoXOverflow: geometryOk(geo),
    softLabel: geo.hasSoftStatus || !!(bulk && bulk.hasSoft) || !!(softModal && softModal.saysNotPermanent),
    noSoftLegacy: !geo.hasSoftLegacy,
    noHardInBulk: !bulk || (!bulk.hasHard && !bulk.hardAttr),
    softInBulkWhenSelected: !bulk || !bulk.visible || bulk.hasSoft,
    softModalNotPermanent: !softModal || softModal.saysNotPermanent || softModal.saysStatusDeleted,
    softModalFits: !softModal || softModal.fits,
  };
  const failed = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { id: "trade", path: "/admin/posts-management", geo, bulk, softModal, checks, failed };
}

async function probeCommunity(page) {
  await page.goto(`${ORIGIN}/admin/community/posts`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-aro-ops-ux-001-w3='1']", { timeout: 90000 });
  await page.waitForTimeout(1500);

  const geo = await page.evaluate(() => {
    const body = document.body;
    const text = body.innerText || "";
    return {
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      hasSoftRow: !!document.querySelector("[data-admin-mgmt-row-soft-delete='1']"),
      softLabelPresent: text.includes("삭제(상태)"),
      hardVisibleWithoutSelect: (() => {
        const bar = document.querySelector("[data-admin-mgmt-bulk-bar='1']");
        return !!(bar && (bar.textContent || "").includes("DB 영구 삭제"));
      })(),
    };
  });

  let bulk = null;
  let hardModal = null;
  const rowSelect = page.locator("[data-admin-mgmt-row-select='1']").first();
  if (await rowSelect.count()) {
    await rowSelect.click({ force: true });
    await page.waitForTimeout(400);
    bulk = await page.evaluate(() => {
      const bar = document.querySelector("[data-admin-mgmt-bulk-bar='1']");
      const t = bar ? bar.textContent || "" : "";
      const hardBtn = document.querySelector("[data-admin-mgmt-hard-delete='1']");
      const hardRect = hardBtn ? hardBtn.getBoundingClientRect() : null;
      return {
        visible: !!bar,
        text: t,
        hasSoft: t.includes("삭제(상태)"),
        hasHard: t.includes("DB 영구 삭제"),
        hardAttr: !!hardBtn,
        hardVisible:
          !!hardBtn &&
          hardRect &&
          hardRect.width > 0 &&
          hardRect.height > 0 &&
          hardRect.bottom <= window.innerHeight + 2 &&
          hardRect.right <= window.innerWidth + 2,
      };
    });

    // Open hard confirm via typed prompt UI — cancel without typing DELETE
    if (bulk?.hardAttr) {
      await page.locator("[data-admin-mgmt-hard-delete='1']").click({ force: true });
      await page.waitForTimeout(700);
      hardModal = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"], [data-dibay-overlay]');
        const root = dlg || document.body;
        const t = root.innerText || "";
        const box = dlg ? dlg.getBoundingClientRect() : null;
        return {
          text: t.slice(0, 1000),
          saysHard: t.includes("DB 영구 삭제"),
          saysIrreversible: t.includes("복구 불가") || /irreversible/i.test(t),
          asksDeleteToken: t.includes("DELETE"),
          fits:
            !box ||
            (box.top >= -2 &&
              box.left >= -2 &&
              box.bottom <= window.innerHeight + 2 &&
              box.right <= window.innerWidth + 2),
        };
      });
      const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
      if (await cancel.count()) await cancel.click({ force: true });
    }
  }

  await page.screenshot({ path: resolve(OUT, "prod-community-posts-b1.png"), fullPage: true });

  const checks = {
    bodyNoXOverflow: geometryOk(geo),
    softRow: geo.hasSoftRow || geo.softLabelPresent,
    hardHiddenUntilSelect: !geo.hardVisibleWithoutSelect,
    hardInBulkWhenSelected: !bulk || (bulk.visible && bulk.hasHard && bulk.hardAttr && bulk.hardVisible),
    softInBulkWhenSelected: !bulk || !bulk.visible || bulk.hasSoft,
    hardModalDistinct: !hardModal || (hardModal.saysHard && hardModal.saysIrreversible && hardModal.asksDeleteToken),
    hardModalFits: !hardModal || hardModal.fits,
  };
  const failed = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { id: "community", path: "/admin/community/posts", geo, bulk, hardModal, checks, failed };
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });
  let headSha = "";
  try {
    headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    headSha = EXPECT_SHA;
  }

  const auth = await loginSession(EMAIL);
  if (!auth?.session) {
    writeFileSync(
      resolve(OUT, "aro-ops-ux-002-b1-prod-light.json"),
      JSON.stringify({ sha: headSha, result: "FAIL", error: "auth_failed" }, null, 2)
    );
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();

  const trade = await probeTrade(page);
  const community = await probeCommunity(page);
  const routes = [trade, community];
  const failed = routes.flatMap((r) => r.failed.map((f) => `${r.id}.${f}`));

  const report = {
    cut: "ARO-OPS-UX-002-B1",
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA,
    origin: ORIGIN,
    authMethod: auth.method,
    viewport: "1024x768",
    routes,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    destructiveProductionTest: "NONE",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-ops-ux-002-b1-prod-light.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
