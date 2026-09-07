#!/usr/bin/env node
/**
 * Admin Settlement — Cash top-up REJECT confirm only.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3045 node --env-file=.env.local \
 *   scripts/qa/admin-settlement-cash-reject-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3045").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/admin-settlement-cash-reject-runtime.json");
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
  title: "ADMIN SETTLEMENT — CASH TOP-UP REJECT",
  HEAD: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  ORIGIN,
  STORE_ID,
  INDEX_STAGED_FINANCE: Number(
    execSync("git diff --cached --name-only | rg -c . || true", { encoding: "utf8", shell: "/bin/zsh" }).trim() || "0"
  ),
};

const browser = await chromium.launch({ headless: true });
try {
  // Create pending top-up as owner
  let requestId = "";
  let amountMinor = 7000;
  {
    const session = await loginSession(OWNER_EMAIL);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await attachSession(ctx, session);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const created = await page.evaluate(
      async ({ storeId, amountMinor }) => {
        const res = await fetch(`/api/me/stores/${storeId}/business-cash`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "topup_request",
            amountMinor,
            idempotencyKey: `settlement_cash_reject:${Date.now()}`,
          }),
        });
        return { status: res.status, json: await res.json().catch(() => ({})) };
      },
      { storeId: STORE_ID, amountMinor }
    );
    report.CREATED = created;
    requestId = String(created.json?.requestId || "");
    if (!requestId) throw new Error(`create_topup_failed:${JSON.stringify(created)}`);

    const snap = await page.evaluate(async (storeId) => {
      const res = await fetch(`/api/me/stores/${storeId}/finance`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const balanceMinor = Number(json?.assets?.businessCash?.balanceMinor ?? NaN);
      const ledger = Array.isArray(json?.businessCashLedger) ? json.businessCashLedger : [];
      return {
        status: res.status,
        balanceMinor,
        ledgerCount: ledger.length,
        latestKinds: ledger.slice(0, 5).map((r) => r.entryKind || r.entry_kind),
      };
    }, STORE_ID);
    report.BALANCE_BEFORE = snap;
    await ctx.close();
  }

  // Admin reject cancel + confirm + double-submit
  {
    const session = await loginSession(ADMIN_EMAIL);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await attachSession(ctx, session);
    const page = await ctx.newPage();
    const posts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/admin/business-cash-charges")) {
        posts.push({ url: req.url(), at: Date.now() });
      }
    });

    await page.goto(
      `${ORIGIN}/admin/delivery-ads/cash-charges?requestId=${encodeURIComponent(requestId)}`,
      { waitUntil: "domcontentloaded", timeout: 120000 }
    );
    const rejectSel = `[data-admin-cash-charge-reject="${requestId}"]`;
    await page.locator(rejectSel).waitFor({ timeout: 90000 });

    // Snapshot request status via list API
    const statusBefore = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/business-cash-charges?status=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const row = (json.requests || []).find((r) => r.id === id);
      return { http: res.status, row };
    }, requestId);
    report.REQUEST = {
      id: requestId,
      store: statusBefore.row?.store_id || STORE_ID,
      amount_minor: statusBefore.row?.amount_minor ?? amountMinor,
      status_before: statusBefore.row?.status || null,
      owner: statusBefore.row?.owner_user_id || null,
      created_at: statusBefore.row?.created_at || null,
    };

    // CANCEL
    await page.locator(rejectSel).click();
    await waitDialog(page);
    const dialogText = await page.locator(".dibay-overlay-root, [role='dialog']").last().innerText();
    report.DIALOG_SNIP = dialogText.slice(0, 400).replace(/\s+/g, " ");
    await clickDialog(page, /취소|Cancel/i);
    await page.waitForTimeout(600);
    const statusAfterCancel = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/business-cash-charges?status=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const row = (json.requests || []).find((r) => r.id === id);
      return row?.status || null;
    }, requestId);
    report.CANCEL = {
      API_MUTATION: posts.length,
      STATUS_CHANGE: statusAfterCancel === report.REQUEST.status_before ? "NONE" : `${report.REQUEST.status_before}->${statusAfterCancel}`,
      RESULT: posts.length === 0 && statusAfterCancel === report.REQUEST.status_before ? "PASS" : "FAIL",
    };

    // CONFIRM
    await page.locator(rejectSel).click();
    await waitDialog(page);
    await clickDialog(page, /거절|Reject|Cash 충전 반려/i);
    await page.waitForTimeout(2500);
    const statusAfterConfirm = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/business-cash-charges?status=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const row = (json.requests || []).find((r) => r.id === id);
      return { status: row?.status || null, row };
    }, requestId);
    report.CONFIRM = {
      API_MUTATION_COUNT: posts.length,
      STATUS_BEFORE: report.REQUEST.status_before,
      STATUS_AFTER: statusAfterConfirm.status,
      ADMIN_ACTOR_HINT: "aaaa@manual.local via requireAdminPermission",
      ROW: statusAfterConfirm.row
        ? {
            id: statusAfterConfirm.row.id,
            status: statusAfterConfirm.row.status,
            reject_reason: statusAfterConfirm.row.reject_reason ?? null,
          }
        : null,
      RESULT:
        posts.length === 1 &&
        String(statusAfterConfirm.status || "").toUpperCase().includes("REJECT")
          ? "PASS"
          : "FAIL",
    };

    // Double-submit on a NEW pending request
    const ownerSession = await loginSession(OWNER_EMAIL);
    const ownerCtx = await browser.newContext();
    await attachSession(ownerCtx, ownerSession);
    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const created2 = await ownerPage.evaluate(
      async ({ storeId }) => {
        const res = await fetch(`/api/me/stores/${storeId}/business-cash`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "topup_request",
            amountMinor: 3000,
            idempotencyKey: `settlement_cash_reject_dbl:${Date.now()}`,
          }),
        });
        return { status: res.status, json: await res.json().catch(() => ({})) };
      },
      { storeId: STORE_ID }
    );
    await ownerCtx.close();
    const requestId2 = String(created2.json?.requestId || "");
    report.DOUBLE_REQUEST = created2;

    if (requestId2) {
      const beforeDbl = posts.length;
      await page.goto(
        `${ORIGIN}/admin/delivery-ads/cash-charges?requestId=${encodeURIComponent(requestId2)}`,
        { waitUntil: "domcontentloaded", timeout: 120000 }
      );
      const reject2 = `[data-admin-cash-charge-reject="${requestId2}"]`;
      await page.locator(reject2).waitFor({ timeout: 90000 });
      await page.locator(reject2).click();
      await waitDialog(page);
      const btn = page
        .locator(".dibay-overlay-root, [role='dialog']")
        .last()
        .getByRole("button", { name: /거절|Reject|Cash 충전 반려/i })
        .first();
      await Promise.all([btn.click(), btn.click().catch(() => null), btn.click().catch(() => null)]);
      await page.waitForTimeout(2500);
      const delta = posts.length - beforeDbl;
      report.DOUBLE_SUBMIT = { API_MUTATION_COUNT: delta, RESULT: delta === 1 ? "PASS" : `FAIL_${delta}` };
    } else {
      report.DOUBLE_SUBMIT = { RESULT: "NOT_PROVEN_NO_SECOND_REQUEST" };
    }

    await ctx.close();
  }

  // Balance / ledger after reject — must be ±0 and no TOP_UP credit
  {
    const session = await loginSession(OWNER_EMAIL);
    const ctx = await browser.newContext();
    await attachSession(ctx, session);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    const snap = await page.evaluate(async (storeId) => {
      const res = await fetch(`/api/me/stores/${storeId}/finance`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const balanceMinor = Number(json?.assets?.businessCash?.balanceMinor ?? NaN);
      const ledger = Array.isArray(json?.businessCashLedger) ? json.businessCashLedger : [];
      return {
        status: res.status,
        balanceMinor,
        ledgerCount: ledger.length,
        latestKinds: ledger.slice(0, 8).map((r) => ({
          kind: r.entryKind || r.entry_kind,
          dir: r.direction,
          amountMinor: r.amountMinor ?? r.amount_minor,
          created_at: r.createdAt || r.created_at,
        })),
      };
    }, STORE_ID);
    report.BALANCE_AFTER = snap;
    const balBefore = Number(report.BALANCE_BEFORE?.balanceMinor);
    const balAfter = Number(snap.balanceMinor);
    const balOk = Number.isFinite(balBefore) && Number.isFinite(balAfter) && balBefore === balAfter;
    const noNewTopupCredit = !(snap.latestKinds || []).some(
      (r) =>
        /TOP.?UP|CHARGE|CREDIT/i.test(String(r.kind || "")) &&
        String(r.dir || "").toLowerCase() === "credit" &&
        Number(r.amountMinor) === Number(report.REQUEST.amount_minor)
    );
    report.LEDGER = {
      BALANCE_CHANGE: balBefore === balAfter ? 0 : balAfter - balBefore,
      NO_REJECT_CREDIT: noNewTopupCredit ? "PASS" : "FAIL",
      RESULT: balOk && noNewTopupCredit ? "PASS" : "FAIL",
    };
    if (report.CANCEL.RESULT === "PASS") {
      report.CANCEL.BALANCE_CHANGE = 0;
      report.CANCEL.LEDGER_CHANGE = "NONE_ASSERTED_VIA_PRE_CONFIRM_SNAPSHOT";
    }
    report.CONFIRM.BALANCE_BEFORE = balBefore;
    report.CONFIRM.BALANCE_AFTER = balAfter;
    report.CONFIRM.LEDGER = report.LEDGER;
    if (report.CONFIRM.RESULT === "PASS" && report.LEDGER.RESULT !== "PASS") {
      report.CONFIRM.RESULT = "FAIL_LEDGER_OR_BALANCE";
    }
    await ctx.close();
  }

  report.RESULT =
    report.CANCEL?.RESULT === "PASS" &&
    report.CONFIRM?.RESULT === "PASS" &&
    report.DOUBLE_SUBMIT?.RESULT === "PASS" &&
    report.LEDGER?.RESULT === "PASS"
      ? "PASS"
      : "FAIL";

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.RESULT === "PASS" ? 0 : 1);
} finally {
  await browser.close();
}
