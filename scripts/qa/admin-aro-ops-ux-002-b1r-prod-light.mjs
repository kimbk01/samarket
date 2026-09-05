#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B1R — Production light (non-destructive where possible).
 * Proves Trade soft bulk ONE confirm + cancel aborts (no second prompt).
 * Hard delete: open typed confirm then cancel (no DELETE typed) → zero wipe.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b1r");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_B1R_EXPECT_SHA || "").slice(0, 9);

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

async function countDialogs(page) {
  return page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
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
      resolve(OUT, "aro-ops-ux-002-b1r-prod-light.json"),
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

  const failed = [];
  const trade = { checks: {} };

  await page.goto(`${ORIGIN}/admin/posts-management`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-aro-ops-ux-001-w1='1']", { timeout: 90000 });
  await page.waitForTimeout(1200);

  const rows = page.locator("[data-admin-mgmt-row-select='1']");
  const rowCount = await rows.count();
  trade.checks.hasRows = rowCount >= 2;
  if (rowCount >= 2) {
    await rows.nth(0).click({ force: true });
    await rows.nth(1).click({ force: true });
    await page.waitForTimeout(300);
    const softBtn = page.locator('[data-admin-mgmt-bulk-action="soft_delete"]');
    trade.checks.softBulkVisible = (await softBtn.count()) > 0;
    await softBtn.click({ force: true });
    await page.waitForTimeout(700);
    const d1 = await countDialogs(page);
    trade.checks.oneDialogAfterSoftClick = d1 === 1;
    const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
    await cancel.click({ force: true });
    await page.waitForTimeout(800);
    const d2 = await countDialogs(page);
    trade.checks.zeroDialogAfterCancel = d2 === 0;
    // wait briefly — old bug would open next prompt
    await page.waitForTimeout(1200);
    const d3 = await countDialogs(page);
    trade.checks.noSecondPrompt = d3 === 0;

    // hard CTA visible
    const hardBtn = page.locator('[data-admin-mgmt-hard-delete="1"]');
    trade.checks.hardCtaVisible = (await hardBtn.count()) > 0;
    if (trade.checks.hardCtaVisible) {
      await hardBtn.click({ force: true });
      await page.waitForTimeout(700);
      const hardText = await page.evaluate(() => document.body.innerText || "");
      trade.checks.hardAsksDelete = hardText.includes("DELETE") && hardText.includes("DB 영구 삭제");
      const cancel2 = page.getByRole("button", { name: /취소|Cancel/i }).first();
      if (await cancel2.count()) await cancel2.click({ force: true });
      await page.waitForTimeout(500);
    }
  }

  await page.screenshot({ path: resolve(OUT, "prod-trade-b1r.png"), fullPage: true });

  await page.goto(`${ORIGIN}/admin/community/posts`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-aro-ops-ux-001-w3='1']", { timeout: 90000 });
  await page.waitForTimeout(1000);
  const community = { checks: {} };
  const crow = page.locator("[data-admin-mgmt-row-select='1']").first();
  if (await crow.count()) {
    await crow.click({ force: true });
    await page.waitForTimeout(400);
    community.checks.hardBulk =
      (await page.locator('[data-admin-mgmt-hard-delete="1"]').count()) > 0;
    community.checks.softBulk =
      (await page.locator('[data-admin-mgmt-bulk-action="soft_delete"]').count()) > 0;
  }
  await page.screenshot({ path: resolve(OUT, "prod-community-b1r.png"), fullPage: true });

  for (const [k, v] of Object.entries(trade.checks)) if (!v) failed.push(`trade.${k}`);
  for (const [k, v] of Object.entries(community.checks)) if (!v) failed.push(`community.${k}`);

  const report = {
    cut: "ARO-OPS-UX-002-B1R",
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA || null,
    origin: ORIGIN,
    authMethod: auth.method,
    viewport: "1024x768",
    trade,
    community,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    destructiveProductionTest: "NONE",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-ops-ux-002-b1r-prod-light.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
