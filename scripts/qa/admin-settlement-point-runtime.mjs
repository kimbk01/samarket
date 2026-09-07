#!/usr/bin/env node
/**
 * Admin Settlement — Point permission fixture + confirm runtime.
 * Does NOT loosen requireAdminPermission("point").
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3037 node --env-file=.env.local \
 *   scripts/qa/admin-settlement-point-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3037").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/admin-settlement-point-runtime.json");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const POINT_TARGET =
  process.env.FINANCE_UX_POINT_USER_ID ||
  process.env.CURRENCY_QA_OWNER_ID ||
  "f00de57c-27d1-495c-824e-e39eab3227aa";

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

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return { session: data.session, via: "password" };
  }
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}`);
  return { session: verified.session, via: "magiclink" };
}

async function attachSession(context, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const admin = sbService();
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id, role")
    .eq("id", session.user.id)
    .maybeSingle();
  let activeSessionId = String(pr?.active_session_id ?? "").trim();
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", session.user.id);
  }
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
  cookies.push({ ...base, name: "samarket_active_session_id", value: activeSessionId });
  await context.addCookies(cookies);
  return { cookieParts: parts.length, profileRole: pr?.role, encodedLen: encoded.length };
}

mkdirSync(resolve(OUT, ".."), { recursive: true });

const report = {
  title: "ADMIN SETTLEMENT — POINT RUNTIME",
  ORIGIN,
  POINT_PERMISSION_OWNER: "canonical AdminPermissionKey:point = YES",
  POINT_ADMIN: ADMIN_EMAIL,
  FIXTURE:
    "admin_memberships.admin_tier operator→manager so role defaults include point; requireAdminPermission(point) unchanged",
};

const { session, via } = await loginSession(ADMIN_EMAIL);
report.LOGIN_VIA = via;

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  report.AUTH_META = await attachSession(ctx, session);
  const page = await ctx.newPage();

  report.POINT_ROUTE = "/admin/points/ledger";
  await page.goto(`${ORIGIN}${report.POINT_ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  try {
    await page.locator("[data-admin-point-adjust='1']").waitFor({ state: "visible", timeout: 120000 });
  } catch {
    report.RESULT = "FAIL_PANEL_NOT_FOUND";
    report.PAGE_DEBUG = {
      url: page.url(),
      body: ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 400),
    };
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const probe = await page.evaluate(async (uid) => {
    const res = await fetch(`/api/admin/points/adjust?userId=${encodeURIComponent(uid)}`, {
      credentials: "include",
      cache: "no-store",
    });
    return {
      status: res.status,
      json: await res.json().catch(() => ({})),
      url: location.href,
    };
  }, POINT_TARGET);
  report.GET_ADJUST = {
    status: probe.status,
    ok: probe.json?.ok,
    error: probe.json?.error,
    balance: probe.json?.balance,
  };
  report.PAGE_DEBUG = { url: probe.url, panelFound: true };

  if (probe.status !== 200 || !probe.json?.ok) {
    report.RESULT = "FAIL_POINT_API";
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const posts = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/admin/points/adjust")) posts.push(req.url());
  });

  await page.locator('[data-point-adjust-user-id="1"]').fill(POINT_TARGET);
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-point-adjust-reason="1"]').fill("admin-settlement-point-proof");

  const waitDialog = async () => {
    await page.locator(".dibay-overlay-root, [role='dialog']").last().waitFor({ state: "visible", timeout: 30000 });
  };
  const clickDialog = async (re) => {
    await page
      .locator(".dibay-overlay-root, [role='dialog']")
      .last()
      .getByRole("button", { name: re })
      .first()
      .click({ timeout: 15000 });
  };

  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  await clickDialog(/취소|Cancel/i);
  await page.waitForTimeout(500);
  report.CREDIT_CANCEL = posts.length === 0 ? "PASS" : "FAIL";

  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  await clickDialog(/Point 지급|Credit Point/i);
  await page.waitForTimeout(2500);
  report.CREDIT_CONFIRM = posts.length === 1 ? "PASS" : `FAIL_${posts.length}`;

  const n1 = posts.length;
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-finance-cta="point-reclaim"]').click();
  await waitDialog();
  await clickDialog(/취소|Cancel/i);
  await page.waitForTimeout(500);
  report.RECLAIM_CANCEL = posts.length === n1 ? "PASS" : "FAIL";

  await page.locator('[data-finance-cta="point-reclaim"]').click();
  await waitDialog();
  await clickDialog(/Point 회수|Reclaim Point/i);
  await page.waitForTimeout(2500);
  report.RECLAIM_CONFIRM = posts.length === n1 + 1 ? "PASS" : `FAIL_${posts.length - n1}`;

  const before = posts.length;
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  const btn = page
    .locator(".dibay-overlay-root, [role='dialog']")
    .last()
    .getByRole("button", { name: /Point 지급|Credit Point/i })
    .first();
  await Promise.all([btn.click(), btn.click().catch(() => null), btn.click().catch(() => null)]);
  await page.waitForTimeout(2500);
  const delta = posts.length - before;
  report.DOUBLE_SUBMIT = delta === 1 ? "PASS" : `FAIL_${delta}`;
  report.POSTS = posts.length;
  report.RESULT = [
    report.CREDIT_CANCEL,
    report.CREDIT_CONFIRM,
    report.RECLAIM_CANCEL,
    report.RECLAIM_CONFIRM,
    report.DOUBLE_SUBMIT,
  ].every((x) => x === "PASS")
    ? "PASS"
    : "FAIL";

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.RESULT === "PASS" ? 0 : 1);
} finally {
  await browser.close();
}
