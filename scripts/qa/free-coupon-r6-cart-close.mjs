/**
 * R6 only — cart bootstrap first, then selector. Does not rerun E1–E10 / R1–R5.
 * PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 \
 *   node --env-file=.env.local scripts/qa/free-coupon-r6-cart-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-r6-cart.json");
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", title: "김치김밥", price: 150 };
const BUYER = { email: "qqqq@manual.local", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" };

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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}
function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}
async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}
function playwrightCookies(session, sessionId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const cookies = [
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
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
  if (sessionId) {
    cookies.push({
      name: "samarket_active_session_id",
      value: sessionId,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return cookies;
}

const report = { origin: ORIGIN, probe: {}, r6: {}, fail: null };
function fail(step, detail) {
  report.fail = { step, detail };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

async function main() {
  loadEnv();
  const sum = await fetch(`${ORIGIN}/api/stores/${STORE.slug}/summary`);
  const sumJ = await sum.json();
  const pub = await fetch(`${ORIGIN}/api/stores/${STORE.slug}`);
  const pubJ = await pub.json();
  report.probe = {
    summary_status: sum.status,
    summary_ok: sumJ?.ok === true,
    summary_store_id: sumJ?.store?.id ?? null,
    public_status: pub.status,
    public_ok: pubJ?.ok === true,
    public_store_id: pubJ?.store?.id ?? null,
  };
  if (sum.status !== 200 || sumJ?.store?.id !== STORE.storeId) fail("PROBE_SUMMARY", JSON.stringify(report.probe));
  if (pub.status !== 200 || pubJ?.store?.id !== STORE.storeId) fail("PROBE_PUBLIC", JSON.stringify(report.probe));

  const sb = sbService();
  const session = await loginSession(BUYER.email);
  const { data: pr } = await sb.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const { data: ents } = await sb
    .from("coupon_user_entitlements")
    .select("id, campaign_id, status, expires_at")
    .eq("buyer_user_id", BUYER.userId)
    .eq("store_id", STORE.storeId)
    .in("status", ["available", "restored"])
    .gt("expires_at", new Date().toISOString())
    .limit(10);
  report.r6.available_entitlements = (ents || []).length;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: {
      cookie: playwrightCookies(session, String(pr?.active_session_id ?? "").trim())
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
  await ctx.addCookies(playwrightCookies(session, String(pr?.active_session_id ?? "").trim()));
  const page = await ctx.newPage();

  await page.goto(`${ORIGIN}/stores/${STORE.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return t.includes("나의 오른손") || t.includes("비었") || t.includes("empty") || t.includes("장바구니") || t.includes("Cart");
    },
    null,
    { timeout: 25000 }
  );
  const emptyText = await page.locator("body").innerText();
  if (/Failed to load store information|매장 정보를 불러올 수 없습니다/.test(emptyText)) {
    fail("CART_BOOTSTRAP", emptyText.slice(0, 400));
  }
  report.r6.cart_empty_ok = true;

  await page.goto(`${ORIGIN}/stores/${STORE.slug}/p/${PRODUCT.productId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const addBtn = page.getByRole("button", { name: /Add ₱|담기|Add to cart|장바구니|카트/i }).first();
  await addBtn.waitFor({ state: "visible", timeout: 25000 });
  await addBtn.click();
  await page.waitForTimeout(2000);
  await page.goto(`${ORIGIN}/stores/${STORE.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("select").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const inc = page.getByRole("button", { name: /수량 늘리기|Increase quantity/i }).first();
  if (await inc.isVisible().catch(() => false)) {
    for (let i = 0; i < 5; i += 1) await inc.click();
    await page.waitForTimeout(1500);
  }
  const cartText = await page.locator("body").innerText();
  if (!cartText.includes(PRODUCT.title) && !cartText.includes("김밥")) fail("CART_ITEM", cartText.slice(0, 400));
  if (/Failed to load store information|매장 정보를 불러올 수 없습니다/.test(cartText)) fail("CART_LOADED_FAIL", cartText.slice(0, 400));
  report.r6.cart_item = "PASS";

  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  report.r6.overflow = ov;
  if (ov > 12) fail("R6_OVERFLOW", String(ov));

  const select = page.locator("select").first();
  await select.waitFor({ state: "visible", timeout: 20000 });
  const n = await select.count();
  report.r6.selector_count = n;
  if (n === 0) fail("SELECTOR", cartText.slice(0, 500));
  const options = await select.locator("option").allTextContents();
  report.r6.options = options;
  const noneVal = await select.locator("option").first().getAttribute("value");
  const values = [];
  const count = await select.locator("option").count();
  for (let i = 0; i < count; i += 1) {
    const opt = select.locator("option").nth(i);
    values.push({
      value: await opt.getAttribute("value"),
      text: (await opt.textContent()) || "",
      disabled: await opt.isDisabled(),
    });
  }
  const selectable = values.filter((v) => v.value && !v.disabled);
  if (selectable.length < 2) fail("SELECTOR_LT2", JSON.stringify(options));
  const r6a = selectable.find((o) => o.text.includes("R6A"));
  const r6b = selectable.find((o) => o.text.includes("R6B"));
  const pickOverride = r6a || selectable.slice().sort((a, b) => a.text.localeCompare(b.text))[0];
  if (r6b) {
    await select.selectOption(r6b.value);
    await page.waitForTimeout(400);
  }
  await select.selectOption(pickOverride.value);
  await page.waitForTimeout(2500);
  const still = await select.inputValue();
  if (still !== pickOverride.value) fail("MANUAL_OVERRIDE", `want=${pickOverride.value} got=${still}`);
  report.r6.manual_override = "PASS";
  await select.selectOption(noneVal || "");
  await page.waitForTimeout(400);
  if ((await select.inputValue()) !== (noneVal || "")) fail("NO_COUPON", await select.inputValue());
  report.r6.change = "PASS";
  report.r6.no_coupon = "PASS";

  const cookie = playwrightCookies(session, String(pr?.active_session_id ?? "").trim())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const best = await fetch(
    `${ORIGIN}/api/me/store-coupons/best-eligible?storeId=${STORE.storeId}&itemGrossPhp=900`,
    { headers: { cookie, accept: "application/json" } }
  );
  const bestJ = await best.json();
  report.r6.best = bestJ?.best ?? null;
  report.r6.quotes = bestJ?.quotes ?? [];
  if (!best.ok || !bestJ?.ok) fail("BEST_API", JSON.stringify(bestJ).slice(0, 300));
  const usable = (bestJ?.quotes ?? []).filter((q) => q.discountAmount > 0 && !q.ineligibleReason);
  const maxDisc = Math.max(0, ...usable.map((q) => q.discountAmount));
  if (!bestJ?.best || Number(bestJ.best.discountAmount) !== maxDisc) {
    fail("BEST_NOT_MAX", JSON.stringify({ best: bestJ?.best, maxDisc }));
  }

  await ctx.close();
  await browser.close();
  report.r6.CART_BOOTSTRAP = "PASS";
  report.r6.R6 = "PASS";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((e) => {
  report.fail = { step: "CRASH", detail: String(e?.stack || e) };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
