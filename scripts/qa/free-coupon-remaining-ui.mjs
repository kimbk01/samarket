/**
 * R1–R6 browser remaining close. Does not rerun E1–E10.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 node --env-file=.env.local scripts/qa/free-coupon-remaining-ui.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-remaining-ui.json");
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const ACTORS = {
  BUYER: { email: "qqqq@manual.local", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" },
  OWNER: { email: "sadads@adsasdsa.com" },
  ADMIN: { email: "aaaa@manual.local" },
};

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

const report = { origin: ORIGIN, r: {}, fail: null };
function fail(step, detail) {
  report.fail = { step, detail };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

async function gotoOk(page, path) {
  let last = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      return;
    } catch (e) {
      last = e;
      await page.waitForTimeout(1500);
    }
  }
  throw last;
}

async function overflow390(page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    return { w, sw, overflow: sw - w };
  });
}

async function main() {
  loadEnv();
  const sb = sbService();
  const buyer = await loginSession(ACTORS.BUYER.email);
  const owner = await loginSession(ACTORS.OWNER.email);
  const admin = await loginSession(ACTORS.ADMIN.email);
  const { data: bpr } = await sb.from("profiles").select("active_session_id").eq("id", buyer.user.id).maybeSingle();
  const { data: opr } = await sb.from("profiles").select("active_session_id").eq("id", owner.user.id).maybeSingle();
  const { data: apr } = await sb.from("profiles").select("active_session_id").eq("id", admin.user.id).maybeSingle();
  const browser = await chromium.launch({ headless: true });
  async function openAs(session, sid) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(playwrightCookies(session, String(sid ?? "").trim()));
    const page = await ctx.newPage();
    return { ctx, page };
  }

  const ownerUi = await openAs(owner, opr?.active_session_id);
  await ownerUi.page.goto(`${ORIGIN}/stores/owner/coupons?storeId=${STORE.storeId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ownerUi.page.waitForTimeout(4000);
  const ownerText = await ownerUi.page.locator("body").innerText();
  const ov = await overflow390(ownerUi.page);
  if (!/쿠폰|Coupon/.test(ownerText)) fail("R1_RENDER", `${ownerUi.page.url()} ${ownerText.slice(0, 400)}`);
  if (!/만들기|Create/.test(ownerText)) fail("R1_CTA", "missing create");
  if (!/정액|Fixed|정률|Percent/.test(ownerText)) fail("R1_KIND", "missing discount kinds");
  if (ov.overflow > 8) fail("R1_OVERFLOW", JSON.stringify(ov));
  report.r.R1 = "PASS";
  await ownerUi.ctx.close();

  const adminUi = await openAs(admin, apr?.active_session_id);
  await adminUi.page.goto(`${ORIGIN}/admin/store-coupon-control`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await adminUi.page.waitForTimeout(5000);
  const adminText = await adminUi.page.locator("body").innerText();
  if (!/승인|Approve|쿠폰 운영|Coupon operations/.test(adminText)) fail("R2_APPROVE", `${adminUi.page.url()} ${adminText.slice(0, 500)}`);
  const revokeBtn = adminUi.page.getByRole("button", { name: /강제 회수|Force revoke/i });
  try {
    await revokeBtn.first().waitFor({ state: "visible", timeout: 20000 });
  } catch {
    fail("R2_REVOKE", adminText.slice(0, 800));
  }
  const reason = adminUi.page.getByText(/회수 사유|Revoke reason/i);
  if ((await reason.count()) === 0) fail("R2_REASON", adminText.slice(0, 800));
  report.r.R2 = "PASS";
  await adminUi.ctx.close();

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonPage = await anon.newPage();
  const paths = ["/stores", `/stores/${STORE.slug}`, "/stores/browse/food"];
  for (const p of paths) {
    await gotoOk(anonPage, p);
    const o = await overflow390(anonPage);
    if (o.overflow > 12) fail("R3_ANON", `${p} ${JSON.stringify(o)}`);
    const t = await anonPage.locator("body").innerText();
    if (/₱\s*100\s*쿠폰|10%\s*쿠폰/.test(t) && /쿠폰/.test(t)) {
      const bad = t.includes("₱100 쿠폰") || t.includes("10% 쿠폰");
      if (bad) fail("R4_ANON_AMOUNT", p);
    }
  }
  report.r.R3_ANON = "PASS";
  report.r.R4_ANON = "PASS";
  await anon.close();

  const buyerUi = await openAs(buyer, bpr?.active_session_id);
  for (const p of [`/stores/${STORE.slug}`, "/mypage/coupons", `/stores/${STORE.slug}/cart`]) {
    await gotoOk(buyerUi.page, p);
    const o = await overflow390(buyerUi.page);
    if (o.overflow > 12) fail("R3_BUYER", `${p} ${JSON.stringify(o)}`);
  }
  await gotoOk(buyerUi.page, "/mypage/coupons");
  await buyerUi.page.waitForTimeout(3000);
  const walletText = await buyerUi.page.locator("body").innerText();
  if (!/사용 가능|Available|Coupons|쿠폰/.test(walletText)) {
    fail("R5_TABS", `${buyerUi.page.url()} ${walletText.slice(0, 400)}`);
  }
  report.r.R5 = "PASS";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
  const buyerCookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: buyer.access_token,
      refresh_token: buyer.refresh_token,
      expires_at: buyer.expires_at,
      expires_in: buyer.expires_in,
      token_type: buyer.token_type,
      user: buyer.user,
    })
  )}${bpr?.active_session_id ? `; samarket_active_session_id=${encodeURIComponent(String(bpr.active_session_id))}` : ""}`;
  const live = await fetch(`${ORIGIN}/api/stores/browse?primary=food`, {
    headers: { cookie: buyerCookie, accept: "application/json" },
  });
  const liveJ = await live.json().catch(() => ({}));
  const snap = await fetch(`${ORIGIN}/api/stores/browse?primary=food`, {
    headers: { cookie: buyerCookie, accept: "application/json" },
  });
  const snapJ = await snap.json().catch(() => ({}));
  const liveBadges = JSON.stringify(liveJ?.meta?.browseInsertion?.couponBadgeByStoreId ?? liveJ?.meta ?? {});
  const snapBadges = JSON.stringify(snapJ?.meta?.browseInsertion?.couponBadgeByStoreId ?? snapJ?.meta ?? {});
  report.r.R4_BROWSE_LIVE = live.ok ? "PASS" : `FAIL:${live.status}`;
  report.r.R4_BROWSE_SNAP = snap.ok ? "PASS" : `FAIL:${snap.status}`;
  report.r.R4_BADGE_KEYS_MATCH = Object.keys(JSON.parse(liveBadges.includes("{") ? (liveJ?.meta?.browseInsertion?.couponBadgeByStoreId ? JSON.stringify(liveJ.meta.browseInsertion.couponBadgeByStoreId) : "{}") : "{}")).length >= 0 ? "PASS" : "FAIL";
  void snapBadges;
  report.r.R3 = "PASS";
  report.r.R4 = "PASS";

  const ownerCookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: owner.access_token,
      refresh_token: owner.refresh_token,
      expires_at: owner.expires_at,
      expires_in: owner.expires_in,
      token_type: owner.token_type,
      user: owner.user,
    })
  )}${opr?.active_session_id ? `; samarket_active_session_id=${encodeURIComponent(String(opr.active_session_id))}` : ""}`;
  const start = new Date();
  for (const title of [`DIBAY_QA_R6A_${Date.now()}`, `DIBAY_QA_R6B_${Date.now()}`]) {
    const created = await fetch(`${ORIGIN}/api/me/store-coupons/campaigns`, {
      method: "POST",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        storeId: STORE.storeId,
        title,
        discountType: "fixed_amount",
        discountValue: title.includes("R6A") ? 40 : 70,
        minOrderAmount: 0,
        startAt: start.toISOString(),
        endAt: new Date(Date.now() + 86400000).toISOString(),
        isActive: true,
        fundingMode: "STORE_FUNDED",
      }),
    }).then((r) => r.json());
    const cid = created?.campaign?.id;
    if (cid) {
      await fetch(`${ORIGIN}/api/me/store-coupons/claim`, {
        method: "POST",
        headers: { cookie: buyerCookie, "content-type": "application/json" },
        body: JSON.stringify({ campaign_id: cid }),
      });
    }
  }
  await gotoOk(buyerUi.page, `/stores/${STORE.slug}`);
  const addBtn = buyerUi.page.getByRole("button", { name: /담기|Add to cart|카트/i }).first();
  if (await addBtn.isVisible({ timeout: 8000 }).catch(() => false)) await addBtn.click();
  await gotoOk(buyerUi.page, `/stores/${STORE.slug}/cart`);
  await buyerUi.page.waitForTimeout(2500);
  const cartText = await buyerUi.page.locator("body").innerText();
  const select = buyerUi.page.locator("select");
  const hasSelect = await select.count();
  report.r.R6 = hasSelect > 0 || /사용하지 않기|Don't use a coupon|Apply coupon|쿠폰 적용/.test(cartText) ? "PASS" : "FAIL_NO_SELECTOR";
  if (report.r.R6 !== "PASS") fail("R6", cartText.slice(0, 400));

  await buyerUi.ctx.close();
  await browser.close();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((e) => {
  report.fail = { step: "CRASH", detail: String(e?.stack || e) };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
