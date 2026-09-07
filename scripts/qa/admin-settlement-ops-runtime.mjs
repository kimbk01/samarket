#!/usr/bin/env node
/**
 * Admin Settlement — Cash top-up / Coin withdrawal confirm + statement parity + CTA locks.
 * Point already closed separately. Does not invent approve writer if SSOT has only reject|mark_paid.
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3037 node --env-file=.env.local \
 *   scripts/qa/admin-settlement-ops-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3037").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/admin-settlement-ops-runtime.json");
const STORE_ID = process.env.CURRENCY_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const OWNER_EMAIL =
  process.env.CURRENCY_QA_OWNER_EMAIL || process.env.QA_OWNER_EMAIL || "sadads@adsasdsa.com";

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
    if (!error && data.session) return data.session;
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
  return verified.session;
}

async function attachSession(context, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const admin = sbService();
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
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
}

async function withContext(browser, email, fn) {
  const session = await loginSession(email);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await attachSession(ctx, session);
  const page = await ctx.newPage();
  try {
    return await fn(page, session);
  } finally {
    await ctx.close();
  }
}

async function waitDialog(page) {
  await page.locator(".dibay-overlay-root, [role='dialog']").last().waitFor({ state: "visible", timeout: 30000 });
}

async function clickDialog(page, re) {
  await page
    .locator(".dibay-overlay-root, [role='dialog']")
    .last()
    .getByRole("button", { name: re })
    .first()
    .click({ timeout: 15000 });
}

mkdirSync(resolve(OUT, ".."), { recursive: true });
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const report = {
  title: "ADMIN SETTLEMENT — OPS RUNTIME",
  HEAD,
  ORIGIN,
  STORE_ID,
  CASH_TOPUP: {},
  WITHDRAWAL: {},
  STORE_STATEMENT: {},
  OWNER_PARITY: {},
  CASH_WITHDRAWAL_CTA: {},
  AXIS_SEPARATION: {},
  COIN_TRACE_UI: {},
};

const browser = await chromium.launch({ headless: true });
try {
  await withContext(browser, ADMIN_EMAIL, async (page) => {
    // --- Cash top-up queue ---
    const topupPosts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && /cash-charge|cash_charge|business-cash|topup|top-up/i.test(req.url())) {
        topupPosts.push({ url: req.url(), method: req.method() });
      }
    });
    await page.goto(`${ORIGIN}/admin/delivery-ads/cash-charges`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);
    const approveBtn = page.locator("[data-admin-cash-charge-complete]").first();
    const rejectBtn = page.locator("[data-admin-cash-charge-reject]").first();
    const hasApprove = (await approveBtn.count()) > 0;
    const hasReject = (await rejectBtn.count()) > 0;
    report.CASH_TOPUP.QUEUE_HAS_PENDING = hasApprove || hasReject;
    report.CASH_TOPUP.APPROVE_CTA_PRESENT = hasApprove;
    report.CASH_TOPUP.REJECT_CTA_PRESENT = hasReject;

    if (hasReject) {
      await rejectBtn.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.CASH_TOPUP.REJECT_CANCEL = topupPosts.length === 0 ? "PASS" : "FAIL";
      await rejectBtn.click();
      await waitDialog(page);
      // Cancel again for safety — do not mutate unless env allows
      if (process.env.ADMIN_SETTLEMENT_MUTATE_TOPUP === "1") {
        await clickDialog(page, /거절|Reject/i);
        await page.waitForTimeout(2000);
        report.CASH_TOPUP.REJECT_CONFIRM = topupPosts.length === 1 ? "PASS" : `FAIL_${topupPosts.length}`;
      } else {
        await clickDialog(page, /취소|Cancel/i);
        report.CASH_TOPUP.REJECT_CONFIRM = "SKIPPED_NO_MUTATE_FLAG_DIALOG_OK";
      }
    } else {
      report.CASH_TOPUP.REJECT_CANCEL = "NOT_PROVEN_NO_PENDING";
      report.CASH_TOPUP.REJECT_CONFIRM = "NOT_PROVEN_NO_PENDING";
    }

    if (hasApprove && process.env.ADMIN_SETTLEMENT_MUTATE_TOPUP === "1") {
      const before = topupPosts.length;
      await approveBtn.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.CASH_TOPUP.APPROVE_CANCEL = topupPosts.length === before ? "PASS" : "FAIL";
      await approveBtn.click();
      await waitDialog(page);
      await clickDialog(page, /적립|Credit/i);
      await page.waitForTimeout(2000);
      report.CASH_TOPUP.APPROVE_CONFIRM =
        topupPosts.length === before + 1 ? "PASS" : `FAIL_${topupPosts.length - before}`;
    } else if (hasApprove) {
      const before = topupPosts.length;
      await approveBtn.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.CASH_TOPUP.APPROVE_CANCEL = topupPosts.length === before ? "PASS" : "FAIL";
      report.CASH_TOPUP.APPROVE_CONFIRM = "SKIPPED_NO_MUTATE_FLAG_DIALOG_OK";
    } else {
      report.CASH_TOPUP.APPROVE_CANCEL = "NOT_PROVEN_NO_PENDING";
      report.CASH_TOPUP.APPROVE_CONFIRM = "NOT_PROVEN_NO_PENDING";
    }

    // --- Withdrawals shell ---
    const wdPosts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/admin/coin-withdrawals")) {
        wdPosts.push(req.url());
      }
    });
    await page.goto(`${ORIGIN}/admin/finance/withdrawals`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    report.CASH_WITHDRAWAL_CTA.ABSENT = !/Cash 출금|Cash withdrawal|Cash 환전|Cash 정산 출금/i.test(body)
      ? "ABSENT"
      : "FAIL";
    report.WITHDRAWAL.SHELL_COPY_COIN_ONLY = /Coin/.test(body) && !/Cash 출금/.test(body) ? "PASS" : "CHECK";
    report.WITHDRAWAL.APPROVE_CTA =
      (await page.locator('[data-finance-cta="approve-withdrawal"]').count()) > 0
        ? "PRESENT"
        : "ABSENT_SSOT_NO_APPROVE_WRITER";
    report.WITHDRAWAL.REJECT_CTA =
      (await page.locator('[data-finance-cta="reject-withdrawal"]').count()) > 0 ? "PRESENT" : "ABSENT";
    report.WITHDRAWAL.PAID_CTA =
      (await page.locator('[data-finance-cta="mark-withdrawal-paid"]').count()) > 0 ? "PRESENT" : "ABSENT";

    if (report.WITHDRAWAL.REJECT_CTA === "PRESENT") {
      const reject = page.locator('[data-finance-cta="reject-withdrawal"]').first();
      await reject.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.WITHDRAWAL.REJECT_CANCEL = wdPosts.length === 0 ? "PASS" : "FAIL";
      if (process.env.ADMIN_SETTLEMENT_MUTATE_WITHDRAWAL === "1") {
        await reject.click();
        await waitDialog(page);
        await clickDialog(page, /출금 반려|Reject withdrawal/i);
        await page.waitForTimeout(2000);
        report.WITHDRAWAL.REJECT_CONFIRM = wdPosts.length === 1 ? "PASS" : `FAIL_${wdPosts.length}`;
      } else {
        report.WITHDRAWAL.REJECT_CONFIRM = "SKIPPED_NO_MUTATE_FLAG_DIALOG_OK";
      }
    } else {
      report.WITHDRAWAL.REJECT_CANCEL = "NOT_PROVEN_NO_REQUESTED";
      report.WITHDRAWAL.REJECT_CONFIRM = "NOT_PROVEN_NO_REQUESTED";
    }

    // --- Store statement API ---
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    const adminStmt = await page.evaluate(
      async ({ storeId, fromIso, toIso }) => {
        const res = await fetch(
          `/api/admin/finance/store-statement?storeId=${encodeURIComponent(storeId)}&fromDay=${fromIso}&toDay=${toIso}`,
          { credentials: "include", cache: "no-store" }
        );
        return { status: res.status, json: await res.json().catch(() => ({})) };
      },
      { storeId: STORE_ID, fromIso, toIso }
    );
    report.STORE_STATEMENT = {
      PERIOD: { from: fromIso, to: toIso },
      HTTP: adminStmt.status,
      OK: adminStmt.json?.ok === true,
      VALUES: adminStmt.json?.statement
        ? {
            coin: adminStmt.json.statement.coin,
            cash: adminStmt.json.statement.cash,
            sales: adminStmt.json.statement.sales,
          }
        : adminStmt.json,
    };

    // Axis separation on finance hub copy
    await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2000);
    const hub = await page.locator("body").innerText();
    const conflation =
      /Point\s*=\s*Coin|Coin\s*=\s*Cash|Cash\s*=\s*PHP|합산|combined balance|total \(Point\+Coin\)/i.test(hub);
    report.AXIS_SEPARATION.HUB = conflation ? "FAIL" : "PASS";
    report.CASH_WITHDRAWAL_CTA.HUB = !/Cash 출금|Cash withdrawal CTA/i.test(hub) ? "ABSENT" : "FAIL";

    // Coin list deep-links presence (transactions wallet=COIN)
    await page.goto(`${ORIGIN}/admin/finance/transactions?wallet=COIN`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(2500);
    const coinBody = await page.locator("body").innerText();
    report.COIN_TRACE_UI = {
      PAGE: page.url(),
      HAS_ROWS: !/No transactions|거래가 없/i.test(coinBody) || /Coin|COIN|전환|출금|적립/i.test(coinBody),
      TEXT_SNIP: coinBody.slice(0, 400).replace(/\s+/g, " "),
    };
  });

  // Owner parity — same store/period read model
  await withContext(browser, OWNER_EMAIL, async (page) => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1000);
    const ownerStmt = await page.evaluate(
      async ({ storeId, fromIso, toIso }) => {
        const qs = `kind=statement&fromDay=${encodeURIComponent(fromIso)}&toDay=${encodeURIComponent(toIso)}`;
        const p = `/api/me/stores/${storeId}/finance/transparent?${qs}`;
        const res = await fetch(p, { credentials: "include", cache: "no-store" });
        return [{ path: p, status: res.status, json: await res.json().catch(() => ({})) }];
      },
      { storeId: STORE_ID, fromIso, toIso }
    );
    report.OWNER_PARITY.PROBES = ownerStmt.map((x) => ({
      path: x.path,
      status: x.status,
      ok: x.json?.ok,
      keys: x.json && typeof x.json === "object" ? Object.keys(x.json).slice(0, 12) : [],
    }));
    const adminCoin = report.STORE_STATEMENT?.VALUES?.coin;
    const ownerHit = ownerStmt.find((x) => x.status === 200 && (x.json?.statement || x.json?.coin || x.json?.ok));
    if (adminCoin && ownerHit?.json) {
      const o = ownerHit.json.statement?.coin || ownerHit.json.coin || ownerHit.json.statement || null;
      if (o && typeof o === "object" && "opening" in o) {
        const keys = ["opening", "earned", "converted", "withdrawn", "closing"];
        const diffs = keys.filter((k) => Number(adminCoin[k]) !== Number(o[k]));
        report.OWNER_PARITY.STORE = STORE_ID;
        report.OWNER_PARITY.PERIOD = { from: fromIso, to: toIso };
        report.OWNER_PARITY.DIFF = diffs.length === 0 ? 0 : diffs;
        report.OWNER_PARITY.RESULT = diffs.length === 0 ? "PASS" : "FAIL";
      } else {
        report.OWNER_PARITY.RESULT = "NOT_PROVEN_SHAPE";
        report.OWNER_PARITY.OWNER_SHAPE = o || ownerHit.json;
      }
    } else {
      report.OWNER_PARITY.RESULT = "NOT_PROVEN_OWNER_API";
    }
  });

  report.RESULT = {
    CASH_TOPUP:
      report.CASH_TOPUP.APPROVE_CANCEL === "PASS" || report.CASH_TOPUP.REJECT_CANCEL === "PASS"
        ? "PARTIAL_OR_PASS"
        : report.CASH_TOPUP.QUEUE_HAS_PENDING
          ? "FAIL"
          : "NOT_PROVEN_NO_PENDING",
    WITHDRAWAL: report.WITHDRAWAL,
    CASH_WITHDRAWAL_CTA: report.CASH_WITHDRAWAL_CTA.ABSENT,
    STORE_STATEMENT: report.STORE_STATEMENT.OK ? "PASS" : "FAIL",
    OWNER_PARITY: report.OWNER_PARITY.RESULT,
    AXIS: report.AXIS_SEPARATION.HUB,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
