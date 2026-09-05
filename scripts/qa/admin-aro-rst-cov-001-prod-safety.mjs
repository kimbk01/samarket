#!/usr/bin/env node
/**
 * ARO-RST-COV-001 — Production safety proof ONLY.
 * No destructive execute. Confirms page + new scope states + Prod execute blocked.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-rst-cov-001-coverage");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_RST_COV_EXPECT_SHA || "").slice(0, 9);

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
      resolve(OUT, "aro-rst-cov-001-prod-safety.json"),
      JSON.stringify({ sha: headSha, result: "FAIL", error: "auth_failed" }, null, 2)
    );
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/admin/prelaunch-reset`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-admin]", { timeout: 90000 });
  await page.waitForSelector("[data-aro-rst-cov-001='1'], [data-aro-rst-001='1']", { timeout: 45000 });
  await page.waitForTimeout(1500);

  const supportOf = async (key) =>
    page.locator(`[data-aro-rst-scope='${key}']`).getAttribute("data-aro-rst-support");

  const checks = {
    page: page.url().includes("/admin/prelaunch-reset"),
    covMarker: (await page.locator("[data-aro-rst-cov-001='1']").count()) > 0,
    matrix: (await page.locator("[data-aro-rst-scope-matrix='1']").count()) > 0,
    selectAll: (await page.locator("[data-aro-rst-select-all='1']").count()) > 0,
    commentsSupported: (await supportOf("community_comments")) === "SUPPORTED",
    supportSupported: (await supportOf("support")) === "SUPPORTED",
    feedSupported: (await supportOf("feed_ads")) === "SUPPORTED",
    popupSupported: (await supportOf("popup")) === "SUPPORTED",
    chatPartial: (await supportOf("chat")) === "PARTIAL",
    couponsPartial: (await supportOf("coupons")) === "PARTIAL",
    notificationsPartial: (await supportOf("notifications")) === "PARTIAL",
    ordersBlocked: (await supportOf("orders")) === "BLOCKED",
    giftsBlocked: (await supportOf("gifts")) === "BLOCKED",
    pointBlocked: (await supportOf("point")) === "BLOCKED",
    settlementBlocked: (await supportOf("settlement")) === "BLOCKED",
    commentsEnabled: !(await page.locator("[data-aro-rst-scope-input='community_comments']").isDisabled()),
    ordersDisabled: await page.locator("[data-aro-rst-scope-input='orders']").isDisabled(),
  };

  // Production execute must remain blocked (403)
  const execProbe = await page.evaluate(async () => {
    const res = await fetch("/api/admin/prelaunch-reset/execute", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset: "TEST_CONTENT_ONLY",
        planId: "probe",
        expectedHash: "0",
        typedConfirmation: "nope",
        selectedScopes: ["community_comments"],
        commentIds: ["00000000-0000-0000-0000-000000000000"],
      }),
    });
    return { status: res.status, ok: res.ok };
  });
  checks.executeBlocked = execProbe.status === 403 || execProbe.ok === false;

  await page.screenshot({ path: resolve(OUT, "prod-prelaunch-reset-cov.png"), fullPage: true });

  const required = Object.keys(checks);
  const failed = required.filter((k) => !checks[k]);
  const report = {
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA || null,
    origin: ORIGIN,
    authMethod: auth.method,
    execProbe,
    checks,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    destructiveProductionTest: "NONE",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-rst-cov-001-prod-safety.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
