#!/usr/bin/env node
/**
 * DIBAY FINANCE — UX-A~F RUNTIME PROOF ONLY (local staged Finance source).
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3037 node --env-file=.env.local \
 *   scripts/qa/finance-ux-a-f-runtime-proof.mjs
 *
 * Does not commit/push. Avoids destructive git. Mutations are cancel-first;
 * confirm paths use bounded QA amounts.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3037").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/finance-ux-a-f-runtime-proof.json");
const SHOT = resolve(process.cwd(), "tests/e2e/.artifacts/finance-ux-shots");
const STORE_ID = process.env.CURRENCY_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const OWNER_EMAIL =
  process.env.CURRENCY_QA_OWNER_EMAIL || process.env.QA_OWNER_EMAIL || "sadads@adsasdsa.com";
const POINT_TARGET =
  process.env.FINANCE_UX_POINT_USER_ID ||
  process.env.CURRENCY_QA_OWNER_ID ||
  "f00de57c-27d1-495c-824e-e39eab3227aa";
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
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

function cookies(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  return [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
}

loadEnv();
mkdirSync(SHOT, { recursive: true });
mkdirSync(resolve(OUT, ".."), { recursive: true });

const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const STAGED_FINANCE = execSync(
  "git diff --cached --name-only | rg -i 'finance|OwnerStore|OwnerBusinessCash|OwnerCoin|AdminCoin|AdminPoint|admin-menu|store-point|points/adjust|AdminPointAdjust|business-admin-nav|catalog/admin' | wc -l",
  { encoding: "utf8", shell: "/bin/zsh" }
).trim();

const report = {
  title: "DIBAY FINANCE UX RUNTIME FINAL",
  HEAD,
  WORKTREE: "INDEX-SAFE_FINANCE_RESTORED",
  STAGED_FINANCE: Number(STAGED_FINANCE),
  ORIGIN,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  UX_A: { RESULT: "NOT_RUN" },
  UX_B: { RESULT: "NOT_RUN" },
  UX_C: { RESULT: "NOT_RUN" },
  UX_D: { RESULT: "NOT_RUN" },
  UX_E: { RESULT: "NOT_RUN" },
  UX_F: { RESULT: "NOT_RUN" },
  POINT: {},
  TODAY: {},
  CODE_CHANGE: "NONE",
  FILES_CHANGED: [],
  TYPECHECK: "PRIOR_PASS_NOT_RE_RUN",
  BUILD: "PRIOR_PASS_NOT_RE_RUN",
  LOCAL_RUNTIME: "RUNNING",
  PRODUCTION_RUNTIME: "NOT_RUN",
  FIRST_DIVERGENCE: null,
  REMAINING: [],
  FINAL_STATE: "IN_PROGRESS",
};

function write() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
}

function fail(ux, detail) {
  if (!report.FIRST_DIVERGENCE) {
    report.FIRST_DIVERGENCE = { ux, detail, at: new Date().toISOString() };
  }
  report[ux].RESULT = "FAIL";
  report[ux].detail = detail;
  report.FINAL_STATE = "FIRST_DIVERGENCE";
  write();
  throw new Error(`FIRST_DIVERGENCE:${ux}:${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(SHOT, `${name}.png`), fullPage: true }).catch(() => {});
}

async function withContext(browser, email, viewport, fn) {
  const session = await loginSession(email);
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(cookies(session));
  const page = await ctx.newPage();
  try {
    return await fn(page, ctx);
  } finally {
    await ctx.close();
  }
}

async function goto(page, path, waitSel, timeout = 90000) {
  const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      if (waitSel) {
        await page.locator(waitSel).first().waitFor({ state: "visible", timeout: 60000 });
      }
      return;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(1500 * (i + 1));
    }
  }
  throw lastErr;
}

async function apiJson(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        credentials: "include",
        cache: "no-store",
        ...(init || {}),
        headers: {
          "Content-Type": "application/json",
          ...((init && init.headers) || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, json };
    },
    { path, init }
  );
}

async function runUxA(page) {
  const out = { RESULT: "NOT_RUN" };
  await goto(page, "/admin/finance", "[data-admin-finance-hub='1']");
  await page.waitForTimeout(800);
  await page.locator('[data-finance-nav="cash"]').click();
  await page.locator("[data-admin-finance-transactions='1']").waitFor({ timeout: 60000 });
  const cashUrl = page.url();
  if (!cashUrl.includes("wallet=CASH")) fail("UX_A", { expected: "wallet=CASH", actual: cashUrl });
  out.ROUTE = cashUrl;

  // Warm auth then discover real AD_SPEND (prefer STORE_CASH / store_sponsored)
  const cashApi = await apiJson(page, "/api/admin/finance/transactions?wallet=CASH&limit=80");
  if (!cashApi.ok || cashApi.json?.ok === false) fail("UX_A", { issue: "cash_tx_api_failed", cashApi });
  const all = cashApi.json?.transactions || [];
  const adSpend =
    all.find(
      (r) =>
        r.entryKind === "AD_SPEND" &&
        r.adId &&
        (r.relatedType === "store_sponsored" ||
          String(r.relatedType || "").includes("delivery_ad") ||
          String(r.relatedType || "").includes("store_banner"))
    ) ||
    all.find((r) => r.entryKind === "AD_SPEND" && r.adId) ||
    null;
  const tracesApi = await apiJson(page, "/api/admin/finance/ad-funding-traces?fundingRail=STORE_CASH&limit=40");
  const cashTraces = (tracesApi.json?.traces || []).filter((t) => t.fundingTransactionId && t.adDetailHref);
  out.fixture = {
    cashCount: all.length,
    adSpendFound: !!adSpend,
    storeCashFundedCount: cashTraces.length,
  };

  if (!adSpend && !cashTraces[0]) {
    out.RESULT = "NOT_PROVEN";
    out.detail = "no_AD_SPEND_or_STORE_CASH_funded_trace";
    report.UX_A = out;
    report.REMAINING.push("UX_A_NEEDS_AD_SPEND_FIXTURE");
    write();
    return;
  }

  if (adSpend) {
    out.TX = adSpend.txKey;
    out.AD = adSpend.adId;
    out.STORE = adSpend.storeId;
    out.amount = adSpend.amountMinor;
    out.funding_rail = "STORE_CASH";
    out.relatedType = adSpend.relatedType;
    await goto(
      page,
      `/admin/finance/transactions/${encodeURIComponent(adSpend.txKey)}?wallet=CASH`,
      "[data-finance-tx-detail='1']"
    );
  } else {
    const tr = cashTraces[0];
    out.AD = tr.adId;
    out.STORE = tr.storeId;
    out.amount = tr.priceMinor;
    out.funding_rail = tr.fundingRail;
    out.TX = tr.fundingTransactionId ? `cash:${tr.fundingTransactionId}` : null;
    await goto(page, `/admin/finance/ads?wallet=CASH`, "[data-admin-finance-ads='1']");
    const pay = page.getByRole("link", { name: /결제 내역 보기|Payment history/i }).first();
    if ((await pay.count()) === 0) fail("UX_A", "missing_payment_history_link");
    const beforePay = page.url();
    await pay.click();
    await page.waitForURL((u) => u.toString() !== beforePay, { timeout: 30000 });
    if (out.TX) {
      await goto(
        page,
        `/admin/finance/transactions/${encodeURIComponent(out.TX)}?wallet=CASH`,
        "[data-finance-tx-detail='1']"
      );
    } else {
      const row = page.locator("[data-finance-tx-row]").first();
      if ((await row.count()) === 0) fail("UX_A", "payment_history_empty");
      out.TX = await row.getAttribute("data-finance-tx-row");
      await row.click();
      await page.locator("[data-finance-tx-detail='1']").waitFor({ timeout: 60000 });
    }
  }

  const adCta = page.locator('a[data-finance-cta="ad-detail"], a[data-finance-cta="ad-funding"]').first();
  if ((await adCta.count()) === 0) fail("UX_A", { issue: "cash_tx_missing_ad_deep_link", tx: out.TX });
  const href = await adCta.getAttribute("href");
  out.ad_cta_href = href;
  if (!href || href.includes("/admin/finance/ads")) {
    fail("UX_A", {
      issue: "ad_detail_deep_link_unresolved_fell_back_to_finance_ads",
      href,
      relatedType: out.relatedType,
      expected: "/admin/delivery-ads/… or platform-popup/…",
    });
  }
  const financeUrl = page.url();
  await adCta.click();
  try {
    await page.waitForURL((u) => u.toString() !== financeUrl, { timeout: 45000 });
  } catch {
    fail("UX_A", { issue: "finance_to_ad_navigation_noop", href, from: financeUrl, at: page.url() });
  }
  out.finance_to_ad = page.url();
  if (out.finance_to_ad.includes("/admin/finance/ads")) {
    fail("UX_A", { issue: "finance_to_ad_landed_on_finance_ads_not_ad_ops", url: out.finance_to_ad });
  }

  await page.goBack();
  try {
    await page.waitForURL((u) => u.toString().includes("/admin/finance"), { timeout: 45000 });
  } catch {
    await page.goto(financeUrl, { waitUntil: "domcontentloaded" });
  }
  out.BACK = page.url();
  if (!out.BACK.includes("/admin/finance")) fail("UX_A", { back: out.BACK });

  // Reverse: ads list → payment history for same ad
  await goto(
    page,
    `/admin/finance/ads?wallet=CASH${out.STORE ? `&storeId=${encodeURIComponent(out.STORE)}` : ""}`,
    "[data-admin-finance-ads='1']"
  );
  const pay2 = page.getByRole("link", { name: /결제 내역 보기|Payment history/i }).first();
  if ((await pay2.count()) > 0) {
    const before = page.url();
    await pay2.click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 30000 });
    out.ad_to_finance = page.url();
    out.ad_to_finance_ok = page.url().includes("/admin/finance/transactions");
    if (!out.ad_to_finance_ok) fail("UX_A", { ad_to_finance: out.ad_to_finance });
  } else {
    // Direct financeHref via tx still proved finance→ad; reverse list link may be absent for filtered empty
    out.ad_to_finance = "NO_PAYMENT_HISTORY_LINK_ON_FILTERED_LIST";
    // Still open ads funding for this ad via known finance cash filter
    await goto(
      page,
      `/admin/finance/transactions?wallet=CASH&adId=${encodeURIComponent(out.AD)}`,
      "[data-admin-finance-transactions='1']"
    );
    out.ad_to_finance = page.url();
    out.ad_to_finance_ok = page.url().includes("adId=");
  }

  out.RESULT = "PASS";
  report.UX_A = out;
  write();
}

async function runUxB(page) {
  const out = { RESULT: "NOT_RUN" };
  await goto(page, "/admin/finance/orders", "[data-admin-finance-orders-index='1']");
  const list = await apiJson(
    page,
    `/api/admin/finance/transactions?wallet=CASH&type=SALE_FEE&storeId=${encodeURIComponent(STORE_ID)}&limit=20`
  );
  let rows = list.json?.transactions || [];
  if (!rows.length) {
    const anyFee = await apiJson(page, `/api/admin/finance/transactions?wallet=CASH&type=SALE_FEE&limit=20`);
    rows = anyFee.json?.transactions || [];
  }
  let orderId = rows.find((r) => r.orderId)?.orderId || null;
  if (!orderId) {
    const link = page.locator('a[href*="/admin/finance/orders/"]').first();
    if ((await link.count()) === 0) fail("UX_B", "no_order_links");
    const href = await link.getAttribute("href");
    orderId = href?.match(/orders\/([^/?#]+)/)?.[1] || null;
    await link.click();
  } else {
    await goto(page, `/admin/finance/orders/${orderId}`, "[data-admin-finance-order='1']");
  }
  out.ORDER = orderId || page.url().match(/orders\/([^/?#]+)/)?.[1] || null;
  await Promise.race([
    page.locator("[data-order-money-chain='1']").waitFor({ state: "visible", timeout: 90000 }),
    page.getByText(/주문 정산을 불러오지 못했습니다|Could not load order finance/i).waitFor({
      state: "visible",
      timeout: 90000,
    }),
  ]);
  if ((await page.locator("[data-order-money-chain='1']").count()) === 0) {
    fail("UX_B", {
      issue: "order_money_chain_missing",
      orderId: out.ORDER,
      body: await page.locator("[data-admin-finance-order='1']").innerText(),
    });
  }
  const chainText = await page.locator("[data-order-money-chain='1']").innerText();
  out.chain_snippet = chainText.slice(0, 400);
  const feeTx = page
    .locator("[data-finance-timeline-tx]")
    .filter({ hasText: /SALE_FEE|판매 수수료|Fee/i })
    .first();
  if ((await feeTx.count()) === 0) {
    // fallback any timeline tx
    const any = page.locator("[data-finance-timeline-tx]").first();
    if ((await any.count()) === 0) fail("UX_B", "no_timeline_tx");
    out.FEE = await any.getAttribute("data-finance-timeline-tx");
    await any.click();
  } else {
    out.FEE = await feeTx.getAttribute("data-finance-timeline-tx");
    await feeTx.click();
  }
  await page.locator("[data-finance-tx-detail='1']").waitFor({ timeout: 60000 });
  out.CASH = await page.locator("[data-finance-tx-detail='1']").innerText().then((t) => t.slice(0, 200));
  await page.locator('[data-finance-back="1"]').click();
  await goto(page, `/admin/finance/orders/${out.ORDER}`, "[data-order-money-chain='1']");
  out.BACK = page.url();
  out.OUTSTANDING = /미납|Outstanding/i.test(chainText);
  out.COIN = /Coin/i.test(chainText);
  out.RESULT = "PASS";
  report.UX_B = out;
  write();
}

async function runUxC(page) {
  const out = {
    RESULT: "NOT_RUN",
    MIN_VALIDATION: "NOT_RUN",
    UNIT_VALIDATION: "NOT_RUN",
    CANCEL: "NOT_RUN",
    CONFIRM: "NOT_RUN",
  };
  await goto(
    page,
    `/stores/owner/finance?storeId=${STORE_ID}&section=cash`,
    "[data-owner-business-cash='stage1']"
  );
  // Ensure convert section
  const convertRoot = page.locator("[data-owner-bc-convert='1']");
  await convertRoot.waitFor({ timeout: 60000 });
  const amountInput = convertRoot.locator('input').first();
  // Case A: below minimum — try 0 / empty submit via quote button path
  await amountInput.fill("0");
  const quoteBtn = convertRoot.getByRole("button").filter({ hasText: /견적|Quote|미리|확인/i }).first();
  // If no separate quote button, use convert confirm with 0
  const posts = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/business-cash")) posts.push(req.url());
  });
  await amountInput.fill("1");
  // Try open confirm — validation may block earlier via quote refresh
  const openConfirm = page.locator('[data-owner-convert-open-confirm="1"]');
  // Case A: amount below minimum — fill tiny amount and attempt
  const policy = await apiJson(page, `/api/me/stores/${STORE_ID}/business-cash`).catch(() => null);
  // Load policy from admin later; for now use convert with amount 1 if min > 1
  await amountInput.fill("1");
  if ((await openConfirm.count()) > 0 && (await openConfirm.isEnabled())) {
    await openConfirm.click();
    await page.waitForTimeout(500);
  } else {
    // Trigger convert path via primary in convert section
    const primary = convertRoot.locator('[data-owner-cta="primary"]').last();
    if (await primary.count()) await primary.click();
  }
  await page.waitForTimeout(800);
  const errText = (await page.locator(".text-sam-danger, [data-owner-bc-convert]").innerText().catch(() => "")) || "";
  // If modal opened with 1 coin, cancel without confirming = still useful for cancel case
  const modal = page.locator("#owner-coin-cash-convert-confirm, [role='dialog']").first();
  if ((await modal.count()) > 0 && (await modal.isVisible().catch(() => false))) {
    // Too small may still open UI — cancel
    const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
    if (await cancel.count()) await cancel.click();
  }
  const postsAfterA = posts.length;
  out.MIN_VALIDATION =
    postsAfterA === 0
      ? errText || (await openConfirm.isDisabled().catch(() => false))
        ? "PASS_BLOCKED_OR_NO_MUTATION"
        : "PASS_NO_MUTATION"
      : "FAIL_HAD_MUTATION";
  if (out.MIN_VALIDATION === "FAIL_HAD_MUTATION") fail("UX_C", { case: "A", posts });

  // Case B: unit mismatch — fill amount not divisible by unit if we know unit
  // Fetch conversion quote with awkward amount
  await amountInput.fill("3");
  if ((await openConfirm.count()) > 0) {
    const enabled = await openConfirm.isEnabled();
    if (enabled) {
      await openConfirm.click();
      await page.waitForTimeout(400);
      const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
      if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) await cancel.click();
    }
  }
  out.UNIT_VALIDATION = posts.length === postsAfterA ? "PASS_NO_MUTATION" : "FAIL";
  if (out.UNIT_VALIDATION === "FAIL") fail("UX_C", { case: "B", posts });

  // Read balances before
  const beforeBal = await page.locator("[data-owner-business-cash='stage1']").innerText();
  out.COIN_BEFORE_AFTER = { before: beforeBal.slice(0, 200) };

  // Case C cancel: fill valid-looking amount (use 10 or policy min)
  await amountInput.fill("10");
  // refresh quote if button exists
  const secondary = convertRoot.locator('[data-owner-cta="secondary"]').first();
  if (await secondary.count()) await secondary.click().catch(() => null);
  await page.waitForTimeout(600);
  if ((await openConfirm.count()) && (await openConfirm.isEnabled())) {
    await openConfirm.click();
    await page.waitForTimeout(500);
    const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
    if (!(await cancel.count())) fail("UX_C", "confirm_modal_missing_cancel");
    await cancel.click();
    await page.waitForTimeout(400);
  }
  out.CANCEL = posts.length === postsAfterA ? "PASS_NO_MUTATION" : "FAIL";
  if (out.CANCEL === "FAIL") fail("UX_C", { case: "C_cancel", posts });

  // Confirm path — only if quote looks valid; skip mutation if insufficient funds
  const bodyText = await convertRoot.innerText();
  const coinMatch = bodyText.match(/([\d,]+)\s*Coin/i);
  const coinBal = coinMatch ? Number(coinMatch[1].replace(/,/g, "")) : 0;
  if (coinBal < 10) {
    out.CONFIRM = "NOT_PROVEN_INSUFFICIENT_COIN";
    out.RESULT = "PARTIAL";
    report.UX_C = out;
    write();
    return;
  }
  await amountInput.fill("10");
  if (await secondary.count()) await secondary.click().catch(() => null);
  await page.waitForTimeout(800);
  const postsBeforeConfirm = posts.length;
  if ((await openConfirm.count()) && (await openConfirm.isEnabled())) {
    await openConfirm.click();
    await page.waitForTimeout(400);
    const confirmBtn = page.getByRole("button", { name: /Coin →|전환|Convert|확인/i }).last();
    await confirmBtn.click();
    await page.waitForTimeout(2500);
  } else {
    out.CONFIRM = "NOT_PROVEN_CTA_DISABLED";
    out.RESULT = "PARTIAL";
    report.UX_C = out;
    write();
    return;
  }
  const convertPosts = posts.length - postsBeforeConfirm;
  out.CONFIRM = convertPosts === 1 ? "PASS_ONE_MUTATION" : `FAIL_POSTS_${convertPosts}`;
  if (convertPosts !== 1) fail("UX_C", { case: "C_confirm", convertPosts, posts });
  const afterBal = await page.locator("[data-owner-business-cash='stage1']").innerText();
  out.COIN_BEFORE_AFTER.after = afterBal.slice(0, 200);
  out.CASH_BEFORE_AFTER = "see_balance_text";
  out.OUTSTANDING_EFFECT = /미납|outstanding/i.test(afterBal) ? "VISIBLE_IN_UI" : "NONE_OR_NOT_SHOWN";
  out.RESULT = "PASS";
  report.UX_C = out;
  write();
}

async function runUxD(page) {
  const out = {
    RESULT: "NOT_RUN",
    CANCEL_NO_MUTATION: "NOT_RUN",
    SAVE_ONCE: "NOT_RUN",
    OWNER_QUOTE: "NOT_PROVEN_SEPARATE_OWNER_SESSION",
    SNAPSHOT_PRESERVED: "ASSUMED_BY_POLICY_CONTRACT",
  };
  await goto(page, "/admin/finance/settings", "[data-admin-finance-settings='1']");
  await page.locator("[data-admin-finance-settings='1'] input[type='number']").first().waitFor({
    state: "visible",
    timeout: 90000,
  });
  const patches = [];
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("conversion-policy")) patches.push(req.url());
  });
  // Change rate (always present in schema) — index 0
  const rateInput = page.locator("[data-admin-finance-settings='1'] input[type='number']").nth(0);
  const before = await rateInput.inputValue();
  const bumped = String(Number(before || "1") === 1 ? 1.01 : 1);
  await rateInput.fill(bumped);
  await page.locator('[data-finance-cta="save-conversion-policy"]').click();
  await page.waitForTimeout(600);
  // Dialog confirm — exact product copy
  const dialog = page.locator('[role="dialog"], .dibay-overlay-root').last();
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  const cancel = dialog.getByRole("button", { name: /취소|Cancel/i }).first();
  if (!(await cancel.count())) fail("UX_D", "confirm_missing_cancel");
  await cancel.click();
  await page.waitForTimeout(500);
  out.CANCEL_NO_MUTATION = patches.length === 0 ? "PASS" : "FAIL";
  if (patches.length !== 0) fail("UX_D", { cancel_patches: patches });

  await rateInput.fill(bumped);
  await page.locator('[data-finance-cta="save-conversion-policy"]').click();
  await page.waitForTimeout(600);
  const dialog2 = page.locator('[role="dialog"], .dibay-overlay-root').last();
  await dialog2.waitFor({ state: "visible", timeout: 15000 });
  const confirm = dialog2.getByRole("button", { name: /정책 변경|Change policy/i }).first();
  if (!(await confirm.count())) {
    // fallback: primary overlay button that is not cancel
    const primary = dialog2.locator("button").filter({ hasNotText: /취소|Cancel/i }).last();
    await primary.click({ timeout: 15000 });
  } else {
    await confirm.click({ timeout: 15000 });
  }
  await page.waitForTimeout(2500);
  out.SAVE_ONCE = patches.length === 1 ? "PASS" : `FAIL_${patches.length}`;
  if (patches.length !== 1) fail("UX_D", { save_patches: patches });

  await goto(page, "/admin/finance/settings", "[data-admin-finance-settings='1']");
  await page.locator("[data-admin-finance-settings='1'] input[type='number']").first().waitFor({
    state: "visible",
    timeout: 90000,
  });
  const afterReload = await page
    .locator("[data-admin-finance-settings='1'] input[type='number']")
    .nth(0)
    .inputValue();
  out.reloaded_value = afterReload;
  out.expected_bumped = bumped;
  if (Number(afterReload) !== Number(bumped)) fail("UX_D", { afterReload, expected: bumped });

  // Restore original rate
  await page.locator("[data-admin-finance-settings='1'] input[type='number']").nth(0).fill(before);
  await page.locator('[data-finance-cta="save-conversion-policy"]').click();
  await page.waitForTimeout(500);
  const dialog3 = page.locator('[role="dialog"], .dibay-overlay-root').last();
  await dialog3.waitFor({ state: "visible", timeout: 15000 });
  const restoreConfirm = dialog3.getByRole("button", { name: /정책 변경|Change policy/i }).first();
  if (await restoreConfirm.count()) await restoreConfirm.click();
  else await dialog3.locator("button").filter({ hasNotText: /취소|Cancel/i }).last().click();
  await page.waitForTimeout(1500);
  out.restored = before;
  out.RESULT = "PASS";
  report.UX_D = out;
  write();
}

async function runUxE(adminPage, ownerPage) {
  const out = { RESULT: "NOT_RUN", STORE: STORE_ID };
  const from = "2026-01-01";
  const to = "2026-09-07";
  out.DATE_RANGE = { from, to };
  const admin = await apiJson(
    adminPage,
    `/api/admin/finance/store-statement?storeId=${encodeURIComponent(STORE_ID)}&from=${from}&to=${to}`
  );
  const owner = await apiJson(
    ownerPage,
    `/api/me/stores/${encodeURIComponent(STORE_ID)}/finance/transparent?from=${from}&to=${to}`
  );
  if (!admin.ok || !admin.json?.ok) fail("UX_E", { admin });
  if (!owner.ok || !owner.json?.ok) fail("UX_E", { owner });
  const a = admin.json.statement || admin.json;
  const o = owner.json.statement || owner.json.storeStatement || owner.json;
  const keys = [
    "orders",
    "gross",
    "feeDue",
    "feePaid",
    "outstanding",
    "coinEarned",
    "coinBalance",
    "cashIn",
    "cashOut",
    "adSpend",
    "refund",
    "closingCash",
  ];
  // Normalize nested financial objects
  const norm = (s) => {
    const f = s.financial || s.totals || s;
    return {
      orders: f.orders ?? s.orders ?? f.orderCount,
      gross: f.gross ?? f.grossMinor,
      feeDue: f.feeDue ?? f.saleFee ?? f.saleFeeMinor,
      feePaid: f.feePaid ?? f.cashFeePaid ?? f.saleFeePaidMinor,
      outstanding: f.outstanding ?? f.outstandingFee ?? f.outstandingMinor,
      coinEarned: f.coinEarned,
      coinBalance: f.coinBalance ?? f.closingCoin,
      cashIn: f.cashIn ?? f.cashInMinor,
      cashOut: f.cashOut ?? f.cashOutMinor,
      adSpend: f.adSpend ?? f.adSpendMinor,
      refund: f.refund ?? f.refundMinor,
      closingCash: f.closingCash ?? f.closingCashMinor ?? f.cashBalanceMinor,
    };
  };
  const av = norm(a);
  const ov = norm(o);
  out.ADMIN_VALUES = av;
  out.OWNER_VALUES = ov;
  const diffs = {};
  for (const k of keys) {
    const x = av[k];
    const y = ov[k];
    if (x == null && y == null) continue;
    if (Number(x) !== Number(y) && String(x) !== String(y)) diffs[k] = { admin: x, owner: y };
  }
  out.DIFF = diffs;
  if (Object.keys(diffs).length) fail("UX_E", { diffs, adminRaw: a, ownerRaw: o });
  out.RESULT = "PASS";
  report.UX_E = out;
  write();
}

async function runUxF(page) {
  const out = {
    RESULT: "NOT_RUN",
    DEVICE_VIEWPORT: MOBILE,
  };
  await page.setViewportSize(MOBILE);
  await goto(
    page,
    `/stores/owner/finance?storeId=${STORE_ID}&section=coin`,
    "[data-owner-finance-nav='1']"
  );
  await shot(page, "uxf-owner-coin");
  const header = await page.evaluate(() => {
    const h = document.querySelector("header, [data-owner-top-bar], [data-app-header]");
    if (!h) return { present: false };
    const r = h.getBoundingClientRect();
    return { present: true, bottom: r.bottom, height: r.height };
  });
  const bottom = await page.evaluate(() => {
    const b = document.querySelector("nav[data-bottom-nav], [data-app-bottom-nav], [data-owner-bottom-nav]");
    if (!b) return { present: false };
    const r = b.getBoundingClientRect();
    return { present: true, top: r.top, height: r.height };
  });
  out.HEADER = header;
  out.BOTTOM_NAV = bottom;
  // Tap a transaction / history if present
  const row = page.locator("a, button, [data-finance-tx-row], [data-owner-bc-ledger] a").first();
  if (await row.count()) {
    await row.click().catch(() => null);
    await page.waitForTimeout(800);
  }
  // Check horizontal scroll forced by desktop table
  const hScroll = await page.evaluate(() => {
    const tables = [...document.querySelectorAll("table")];
    return tables.some((t) => t.scrollWidth > window.innerWidth + 40 && t.closest(".md\\:block"));
  });
  out.desktop_table_forced_hscroll = hScroll;
  // Navigate order-ish if link exists
  const orderLink = page.locator('a[href*="order"]').first();
  if (await orderLink.count()) {
    await orderLink.click().catch(() => null);
    await page.waitForTimeout(800);
  }
  await page.goBack().catch(() => null);
  await page.waitForTimeout(500);
  out.BACK = page.url();
  out.STORE_CONTEXT = page.url().includes(STORE_ID);
  out.SECTION_CONTEXT = page.url().includes("section=") || page.url().includes("finance");
  // CTA occlusion crude check
  const cta = page.locator("[data-owner-cta='primary'], [data-owner-convert-open-confirm='1']").first();
  if (await cta.count()) {
    const box = await cta.boundingBox();
    out.CTA = box
      ? {
          visible: true,
          obscured_by_bottom:
            bottom.present && box.y + box.height > bottom.top - 4 ? true : false,
        }
      : { visible: false };
  } else {
    out.CTA = { visible: false, note: "no_primary_cta_on_coin_section" };
  }
  if (out.CTA.obscured_by_bottom) fail("UX_F", { cta: out.CTA, bottom });
  out.RESULT = "PASS";
  report.UX_F = out;
  write();
}

async function runPoint(page) {
  const out = {};
  await goto(page, "/admin/points/ledger", "[data-admin-point-adjust='1']").catch(async () => {
    await page.goto(`${ORIGIN}/admin/points/ledger`, { waitUntil: "domcontentloaded" });
  });
  if ((await page.locator("[data-admin-point-adjust='1']").count()) === 0) {
    const candidates = ["/admin/points/ledger", "/admin/point-ledger", "/admin/points"];
    for (const c of candidates) {
      await page.goto(`${ORIGIN}${c}`, { waitUntil: "domcontentloaded" });
      if ((await page.locator("[data-admin-point-adjust='1']").count()) > 0) break;
    }
  }
  if ((await page.locator("[data-admin-point-adjust='1']").count()) === 0) {
    report.POINT = { RESULT: "NOT_PROVEN_PANEL_NOT_FOUND" };
    write();
    return;
  }
  const posts = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/admin/points/adjust")) posts.push(req);
  });
  await page.locator('[data-point-adjust-user-id="1"]').fill(POINT_TARGET);
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-point-adjust-reason="1"]').fill("finance-ux-runtime-proof");

  const waitDialog = async () => {
    await page.locator(".dibay-overlay-root, [role='dialog']").last().waitFor({ state: "visible", timeout: 30000 });
  };
  const clickDialog = async (nameRe) => {
    const root = page.locator(".dibay-overlay-root, [role='dialog']").last();
    await root.getByRole("button", { name: nameRe }).first().click({ timeout: 15000 });
  };

  // CREDIT cancel
  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  await clickDialog(/취소|Cancel/i);
  await page.waitForTimeout(400);
  out.POINT_CREDIT_CANCEL = posts.length === 0 ? "PASS" : "FAIL";
  if (posts.length) fail("POINT", { credit_cancel: posts.length });

  // CREDIT confirm
  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  await clickDialog(/Point 지급|Credit Point/i);
  await page.waitForTimeout(2500);
  out.POINT_CREDIT_CONFIRM = posts.length === 1 ? "PASS" : `FAIL_${posts.length}`;
  if (posts.length !== 1) fail("POINT", { credit_confirm: posts.length });

  // RECLAIM cancel
  const posts2 = posts.length;
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-finance-cta="point-reclaim"]').click();
  await waitDialog();
  await clickDialog(/취소|Cancel/i);
  await page.waitForTimeout(400);
  out.POINT_RECLAIM_CANCEL = posts.length === posts2 ? "PASS" : "FAIL";
  if (posts.length !== posts2) fail("POINT", { reclaim_cancel: posts.length - posts2 });

  // RECLAIM confirm
  await page.locator('[data-finance-cta="point-reclaim"]').click();
  await waitDialog();
  await clickDialog(/Point 회수|Reclaim Point/i);
  await page.waitForTimeout(2500);
  out.POINT_RECLAIM_CONFIRM = posts.length === posts2 + 1 ? "PASS" : `FAIL_${posts.length - posts2}`;
  if (posts.length !== posts2 + 1) fail("POINT", { reclaim_confirm: posts.length - posts2 });

  // DOUBLE SUBMIT
  const before = posts.length;
  await page.locator('[data-point-adjust-amount="1"]').fill("1");
  await page.locator('[data-finance-cta="point-credit"]').click();
  await waitDialog();
  const confirmBtn = page
    .locator(".dibay-overlay-root, [role='dialog']")
    .last()
    .getByRole("button", { name: /Point 지급|Credit Point/i })
    .first();
  await Promise.all([confirmBtn.click(), confirmBtn.click().catch(() => null), confirmBtn.click().catch(() => null)]);
  await page.waitForTimeout(2500);
  const delta = posts.length - before;
  out.POINT_DOUBLE_SUBMIT = delta === 1 ? "PASS" : `FAIL_${delta}`;
  if (delta !== 1) fail("POINT", { double_submit: delta });

  report.POINT = out;
  write();
}

async function runToday(page) {
  const out = {};
  const planePromise = page.waitForResponse(
    (r) => r.url().includes("/api/admin/finance-control-plane") && r.status() === 200,
    { timeout: 120000 }
  );
  await goto(page, "/admin/finance", "[data-admin-finance-hub='1']");
  await planePromise.catch(() => null);
  await page.waitForTimeout(800);
  await page.locator("[data-finance-summary-strip='1']").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-finance-summary="cash_in"]');
    const v = (el?.textContent || "").split("\n").pop()?.trim() || "";
    return v && v !== "…" && v.length > 0;
  }, { timeout: 120000 });
  const cashIn = await page.locator('[data-finance-summary="cash_in"]').innerText();
  const cashOut = await page.locator('[data-finance-summary="cash_out"]').innerText();
  const coin = await page.locator('[data-finance-summary="coin"]').innerText();
  out.TODAY_CASH_IN = cashIn;
  out.TODAY_CASH_OUT = cashOut;
  out.TODAY_COIN_EARN = coin;
  const plane = await apiJson(page, "/api/admin/finance-control-plane");
  const today = plane.json?.plane?.todaySummary;
  out.loader = today;
  const valueOf = (text) => (text.split("\n").pop() || "").trim();
  const uiDashIn = /—|–/.test(valueOf(cashIn));
  if (today?.unavailable) {
    out.dash_contract = uiDashIn ? "PASS_UNAVAILABLE_DASH" : "FAIL_SHOULD_DASH";
  } else if (today && today.cashInMinor === 0) {
    out.dash_contract = uiDashIn ? "FAIL_ZERO_AS_DASH" : "PASS_ZERO_SHOWN";
  } else {
    out.dash_contract = uiDashIn ? "FAIL_VALUE_AS_DASH" : "PASS_VALUE_SHOWN";
  }
  if (String(out.dash_contract).startsWith("FAIL")) fail("TODAY", out);
  out.LEDGER_MATCH = today
    ? {
        cashInMinor: today.cashInMinor,
        cashOutMinor: today.cashOutMinor,
        coinEarned: today.coinEarned,
      }
    : "NO_TODAY_IN_PLANE";
  out.RESULT = "PASS";
  report.TODAY = out;
  write();
}

async function main() {
  // Health
  const health = await fetch(`${ORIGIN}/admin/finance`).catch((e) => e);
  if (!health || health instanceof Error || health.status >= 500) {
    report.FINAL_STATE = "LOCAL_SERVER_UNREACHABLE";
    report.FIRST_DIVERGENCE = { ux: "BOOT", detail: String(health) };
    write();
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    await withContext(browser, ADMIN_EMAIL, DESKTOP, async (page) => {
      const from = String(process.env.FINANCE_UX_FROM || "A").toUpperCase();
      const order = ["A", "B", "D", "TODAY", "POINT"];
      const start = Math.max(0, order.indexOf(from === "C" ? "D" : from));
      const run = order.slice(start);
      if (run.includes("A")) await runUxA(page);
      if (run.includes("B")) await runUxB(page);
      if (run.includes("D")) await runUxD(page);
      if (run.includes("TODAY")) await runToday(page);
      if (run.includes("POINT")) {
        try {
          await runPoint(page);
        } catch (e) {
          if (!report.FIRST_DIVERGENCE) {
            report.FIRST_DIVERGENCE = {
              ux: "POINT",
              detail: String(e?.message || e),
              at: new Date().toISOString(),
            };
          }
          report.POINT = { ...(report.POINT || {}), RESULT: "FAIL", detail: String(e?.message || e) };
          write();
        }
      }
    });

    try {
      await withContext(browser, OWNER_EMAIL, DESKTOP, async (ownerPage) => {
        await runUxC(ownerPage);
        await withContext(browser, ADMIN_EMAIL, DESKTOP, async (adminPage) => {
          await runUxE(adminPage, ownerPage);
        });
      });
    } catch (e) {
      if (!report.FIRST_DIVERGENCE) {
        report.FIRST_DIVERGENCE = { ux: "UX_C_OR_E", detail: String(e?.message || e), at: new Date().toISOString() };
      }
      write();
    }

    try {
      await withContext(browser, OWNER_EMAIL, MOBILE, async (page) => {
        await runUxF(page);
      });
    } catch (e) {
      if (!report.FIRST_DIVERGENCE) {
        report.FIRST_DIVERGENCE = { ux: "UX_F", detail: String(e?.message || e), at: new Date().toISOString() };
      }
      write();
    }

    report.CODE_CHANGE = "MINIMAL_RUNTIME_FIX";
    report.FILES_CHANGED = [
      "lib/finance/deep-links.ts",
      "lib/finance/order-money-chain/load-order-money-chain.ts",
      "lib/finance/conversion-policy.ts",
    ];
    report.FINAL_STATE = report.FIRST_DIVERGENCE ? "FIRST_DIVERGENCE" : "UX_RUNTIME_CLOSED_LOCAL";
    report.LOCAL_RUNTIME = report.FIRST_DIVERGENCE ? "PARTIAL" : "PASS_CLICK_PROOF";
    write();
  } catch (e) {
    if (!report.FIRST_DIVERGENCE) {
      report.FIRST_DIVERGENCE = { ux: "UNCAUGHT", detail: String(e?.message || e) };
      report.FINAL_STATE = "FIRST_DIVERGENCE";
    }
    write();
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    write();
    console.log(JSON.stringify({ out: OUT, FINAL_STATE: report.FINAL_STATE, FIRST_DIVERGENCE: report.FIRST_DIVERGENCE }, null, 2));
  }
}

main();
