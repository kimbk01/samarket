#!/usr/bin/env node
/**
 * Admin Settlement ops close: create pending fixtures → confirm dialogs → statement parity.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3042 node --env-file=.env.local \
 *   scripts/qa/admin-settlement-ops-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3042").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/admin-settlement-ops-runtime.json");
const STORE_ID = process.env.CURRENCY_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const OWNER_EMAIL =
  process.env.CURRENCY_QA_OWNER_EMAIL || process.env.QA_OWNER_EMAIL || "sadads@adsasdsa.com";

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
const report = {
  title: "ADMIN SETTLEMENT OPS CLOSE",
  HEAD: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  ORIGIN,
  STORE_ID,
};

const browser = await chromium.launch({ headless: true });
try {
  // Owner fixtures + statement
  {
    const session = await loginSession(OWNER_EMAIL);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await attachSession(ctx, session);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 120000 });

    report.created = {
      topup: await page.evaluate(async (storeId) => {
        const res = await fetch(`/api/me/stores/${storeId}/business-cash`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "topup_request",
            amountMinor: 10000,
            idempotencyKey: `settlement_topup:${Date.now()}`,
          }),
        });
        return { status: res.status, json: await res.json().catch(() => ({})) };
      }, STORE_ID),
      withdrawal: await page.evaluate(async (storeId) => {
        const res = await fetch(`/api/me/stores/${storeId}/finance/withdrawals`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: 1,
            destinationType: "gcash",
            accountNumber: "09000000000",
            accountName: "QA Settlement",
            idempotencyKey: `settlement_wd:${Date.now()}`,
          }),
        });
        return { status: res.status, json: await res.json().catch(() => ({})) };
      }, STORE_ID),
    };

    const ownerStmt = await page.evaluate(async (storeId) => {
      const res = await fetch(`/api/me/stores/${storeId}/finance/transparent?kind=statement&period=30d`, {
        credentials: "include",
        cache: "no-store",
      });
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 240) };
      }
      return { status: res.status, ct, json };
    }, STORE_ID);
    report.OWNER_STATEMENT = {
      status: ownerStmt.status,
      ok: ownerStmt.json?.ok === true,
      coin: ownerStmt.json?.statement?.coin ?? null,
      cash: ownerStmt.json?.statement?.cash ?? null,
      sales: ownerStmt.json?.statement?.sales ?? null,
      error: ownerStmt.json?.error || ownerStmt.json?.raw || null,
    };
    await ctx.close();
  }

  // Admin ops
  {
    const session = await loginSession(ADMIN_EMAIL);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await attachSession(ctx, session);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1500);

    const adminStmt = await page.evaluate(async (storeId) => {
      const res = await fetch(`/api/admin/finance/store-statement?storeId=${storeId}&period=30d`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    }, STORE_ID);
    report.ADMIN_STATEMENT = {
      status: adminStmt.status,
      ok: adminStmt.json?.ok === true,
      coin: adminStmt.json?.statement?.coin ?? null,
      cash: adminStmt.json?.statement?.cash ?? null,
      sales: adminStmt.json?.statement?.sales ?? null,
    };

    if (report.ADMIN_STATEMENT.coin && report.OWNER_STATEMENT.coin) {
      const coinKeys = ["opening", "earned", "converted", "withdrawn", "closing"];
      const cashKeys = [
        "openingMinor",
        "topupMinor",
        "fromConversionMinor",
        "saleFeeMinor",
        "adSpendMinor",
        "closingMinor",
      ];
      const coinDiffs = coinKeys.filter(
        (k) => Number(report.ADMIN_STATEMENT.coin[k]) !== Number(report.OWNER_STATEMENT.coin[k])
      );
      const cashDiffs = cashKeys.filter(
        (k) => Number(report.ADMIN_STATEMENT.cash[k]) !== Number(report.OWNER_STATEMENT.cash[k])
      );
      report.OWNER_PARITY = {
        STORE: STORE_ID,
        PERIOD: "30d",
        DIFF_COIN: coinDiffs.length ? coinDiffs : 0,
        DIFF_CASH: cashDiffs.length ? cashDiffs : 0,
        RESULT: coinDiffs.length === 0 && cashDiffs.length === 0 ? "PASS" : "FAIL",
      };
    } else {
      report.OWNER_PARITY = {
        RESULT: "NOT_PROVEN",
        ownerStatus: report.OWNER_STATEMENT.status,
        adminStatus: report.ADMIN_STATEMENT.status,
      };
    }

    // Cash top-up approve cancel/confirm
    const topupPosts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/admin/business-cash-charges")) {
        topupPosts.push(req.url());
      }
    });
    await page.goto(`${ORIGIN}/admin/delivery-ads/cash-charges`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page
      .locator("[data-admin-cash-charge-complete], [data-admin-cash-charge-reject]")
      .first()
      .waitFor({ timeout: 90000 })
      .catch(() => null);
    const approveBtn = page.locator("[data-admin-cash-charge-complete]").first();
    report.CASH_TOPUP = {
      APPROVE_CTA: (await approveBtn.count()) > 0,
      REJECT_CTA: (await page.locator("[data-admin-cash-charge-reject]").count()) > 0,
    };
    if ((await approveBtn.count()) > 0) {
      await approveBtn.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.CASH_TOPUP.APPROVE_CANCEL = topupPosts.length === 0 ? "PASS" : "FAIL";
      await approveBtn.click();
      await waitDialog(page);
      await clickDialog(page, /적립|Credit/i);
      await page.waitForTimeout(2500);
      report.CASH_TOPUP.APPROVE_CONFIRM = topupPosts.length === 1 ? "PASS" : `FAIL_${topupPosts.length}`;
    } else {
      report.CASH_TOPUP.APPROVE_CANCEL = "NOT_PROVEN_NO_PENDING";
      report.CASH_TOPUP.APPROVE_CONFIRM = "NOT_PROVEN_NO_PENDING";
    }

    // Withdrawal reject cancel/confirm (+ paid cancel only)
    const wdPosts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/admin/coin-withdrawals")) {
        wdPosts.push(req.url());
      }
    });
    await page.goto(`${ORIGIN}/admin/finance/withdrawals`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    report.CASH_WITHDRAWAL_CTA = !/Cash 출금|Cash withdrawal/i.test(body) ? "ABSENT" : "FAIL";
    report.WITHDRAWAL = {
      APPROVE_CTA:
        (await page.locator('[data-finance-cta="approve-withdrawal"]').count()) > 0
          ? "PRESENT"
          : "ABSENT_SSOT_NO_APPROVE_WRITER",
      REJECT_CTA: (await page.locator('[data-finance-cta="reject-withdrawal"]').count()) > 0 ? "PRESENT" : "ABSENT",
      PAID_CTA: (await page.locator('[data-finance-cta="mark-withdrawal-paid"]').count()) > 0 ? "PRESENT" : "ABSENT",
    };
    if (report.WITHDRAWAL.REJECT_CTA === "PRESENT") {
      const reject = page.locator('[data-finance-cta="reject-withdrawal"]').first();
      await reject.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.WITHDRAWAL.REJECT_CANCEL = wdPosts.length === 0 ? "PASS" : "FAIL";
      await reject.click();
      await waitDialog(page);
      await clickDialog(page, /출금 반려|Reject withdrawal/i);
      await page.waitForTimeout(2500);
      report.WITHDRAWAL.REJECT_CONFIRM = wdPosts.length === 1 ? "PASS" : `FAIL_${wdPosts.length}`;
    } else {
      report.WITHDRAWAL.REJECT_CANCEL = "NOT_PROVEN_NO_REQUESTED";
      report.WITHDRAWAL.REJECT_CONFIRM = "NOT_PROVEN_NO_REQUESTED";
    }

    // Create a second withdrawal for paid-cancel-only proof if none left
    if ((await page.locator('[data-finance-cta="mark-withdrawal-paid"]').count()) === 0) {
      // no remaining REQUESTED after reject — paid CTA N/A this run
      report.WITHDRAWAL.PAID_CANCEL = "NOT_PROVEN_NO_REQUESTED_AFTER_REJECT";
      report.WITHDRAWAL.PAID_CONFIRM = "NOT_RUN_AVOID_ORPHAN_PAYOUT";
    } else {
      const before = wdPosts.length;
      const paid = page.locator('[data-finance-cta="mark-withdrawal-paid"]').first();
      await paid.click();
      await waitDialog(page);
      await clickDialog(page, /취소|Cancel/i);
      await page.waitForTimeout(400);
      report.WITHDRAWAL.PAID_CANCEL = wdPosts.length === before ? "PASS" : "FAIL";
      report.WITHDRAWAL.PAID_CONFIRM = "SKIPPED_AVOID_PAYOUT_MUTATION";
    }

    const hub = await page.goto(`${ORIGIN}/admin/finance`, { waitUntil: "domcontentloaded", timeout: 120000 });
    void hub;
    await page.waitForTimeout(1500);
    const hubText = await page.locator("body").innerText();
    report.AXIS_SEPARATION = /Point\s*=\s*Coin|Coin\s*=\s*Cash|Cash\s*=\s*PHP/i.test(hubText) ? "FAIL" : "PASS";

    await ctx.close();
  }

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
