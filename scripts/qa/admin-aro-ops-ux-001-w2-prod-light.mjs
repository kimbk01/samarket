#!/usr/bin/env node
/**
 * ARO-OPS-UX-001-W2 — Production light for /admin/users (non-destructive).
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-001-w2");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const EXPECT_SHA = (process.env.ARO_OPS_UX_W2_EXPECT_SHA || "").slice(0, 9);

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
      resolve(OUT, "aro-ops-ux-001-w2-prod-light.json"),
      JSON.stringify({ sha: headSha, result: "FAIL", error: "auth_failed" }, null, 2)
    );
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(auth.session.user?.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/admin/users`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-aro-ops-ux-001-w2='1'], [data-aro-ops-ux-001-w1='1']", {
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

  const geo = await page.evaluate(() => {
    const body = document.body;
    const vp = document.querySelector("[data-admin-mgmt-table-viewport='1']");
    return {
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      tableViewportScrollWidth: vp ? vp.scrollWidth : 0,
      tableViewportClientWidth: vp ? vp.clientWidth : 0,
      hasW2: !!document.querySelector("[data-aro-ops-ux-001-w2='1']"),
      hasViewport: !!vp,
      hasSelectAll: !!document.querySelector("[data-admin-mgmt-select-all='1']"),
      hasRowSelect: document.querySelectorAll("[data-admin-mgmt-row-select='1']").length,
      hasDeletionQueue: !!document.querySelector("[data-admin-member-deletion-request-queue='1']"),
    };
  });

  if (geo.hasSelectAll && geo.hasRowSelect > 0) {
    await page.locator("[data-admin-mgmt-select-all='1']").click({ force: true });
    await page.waitForTimeout(400);
  }

  const afterSelect = await page.evaluate(() => {
    const bar = document.querySelector("[data-admin-mgmt-bulk-bar='1']");
    const empty = document.querySelector("[data-admin-mgmt-bulk-empty='1']");
    return {
      bulkVisible: !!bar,
      bulkText: bar ? bar.textContent || "" : "",
      emptyHint: !!empty,
      hasHardDeleteButton: bar
        ? /영구 삭제|hard delete|bulk.?delete/i.test(bar.textContent || "")
        : false,
    };
  });

  await page.screenshot({ path: resolve(OUT, "prod-admin-users-w2.png"), fullPage: true });

  const checks = {
    page: page.url().includes("/admin/users"),
    w2Root: geo.hasW2,
    tableViewport: geo.hasViewport,
    selectAll: geo.hasSelectAll,
    rowSelect: geo.hasRowSelect > 0,
    bodyNoXOverflow: geo.bodyScrollWidth <= geo.bodyClientWidth + 1,
    deletionQueueSeparate: geo.hasDeletionQueue,
    bulkBarWhenSelected: afterSelect.bulkVisible || geo.hasRowSelect === 0,
    noHardDeleteInBulk: !afterSelect.hasHardDeleteButton,
    destructiveMutation: false,
  };

  const failed = Object.entries(checks)
    .filter(([k, v]) => k !== "destructiveMutation" && !v)
    .map(([k]) => k);

  const report = {
    sha: headSha.slice(0, 9),
    expectSha: EXPECT_SHA || null,
    origin: ORIGIN,
    authMethod: auth.method,
    geo,
    afterSelect,
    checks,
    failed,
    result: failed.length === 0 ? "PASS" : "PARTIAL",
    destructiveProductionTest: "NONE",
    at: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, "aro-ops-ux-001-w2-prod-light.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
