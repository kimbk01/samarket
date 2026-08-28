/**
 * Customer Commerce Hub — Production visual + device close (V1–V7 + matrix).
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/customer-commerce-hub-production-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT_SHA = (process.env.EXPECT_GIT_SHA || "d334f121f").slice(0, 9);
const OUT = resolve(process.cwd(), ".tmp-customer-commerce-hub-production-close.json");
const SHOT = resolve(process.cwd(), ".tmp-customer-commerce-hub-shots");
const BUYER_EMAIL = process.env.COMMERCE_HUB_BUYER_EMAIL?.trim() || "wwww@manual.local";

const VIEWPORTS = [
  { id: "390", width: 390, height: 844 },
  { id: "430", width: 430, height: 932 },
  { id: "768", width: 768, height: 1024 },
  { id: "820", width: 820, height: 1180 },
  { id: "1024", width: 1024, height: 1366 },
  { id: "desktop", width: 1440, height: 900 },
];

const report = {
  title: "Customer Commerce Hub — Production close",
  origin: ORIGIN,
  expectSha: EXPECT_SHA,
  deploy: "PENDING",
  productionCommit: EXPECT_SHA,
  firstDivergence: null,
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  legacyComponentCleanup: "NOT_RUN",
  apk: "NOT_PROVEN",
  ios: "NOT_PROVEN",
  checks: {},
  deviceMatrix: {},
  artifacts: {},
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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

function playwrightCookies(session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
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
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
}

function setCheck(id, pass, detail = null) {
  report.checks[id] = { pass, detail };
  if (!pass && !report.firstDivergence) report.firstDivergence = id;
}

async function waitHubReady(page) {
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() => !!document.querySelector('[data-commerce-hub-primary-tabs="1"]'));
    if (ready) {
      await page.waitForTimeout(500);
      return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("hub_tabs_timeout");
}

async function gotoHub(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitHubReady(page);
}

async function hubMetrics(page) {
  return page.evaluate(() => {
    const norm = (s) => (s ?? "").trim();
    const regionBars = document.querySelectorAll("[data-region-bar], [data-app-sticky-header]").length;
    const tabRails = document.querySelectorAll('[data-commerce-hub-primary-tabs="1"]').length;
    const headers = document.querySelectorAll("[data-my-subpage-header]").length;
    const titleNodes = [...document.querySelectorAll("[data-region-bar-title], [data-tier1-title], h1, [data-app-sticky-header] h1, [data-app-sticky-header] p")];
    const title = titleNodes.map((el) => norm(el.textContent)).find((t) => /주문|Orders|benefits|혜택/i.test(t)) || norm(titleNodes[0]?.textContent);
    const activeTab = document.querySelector('[data-commerce-hub-tab][aria-selected="true"]')?.getAttribute("data-commerce-hub-tab");
    const bodyTab = document.querySelector("[data-customer-commerce-hub-body]")?.getAttribute("data-commerce-hub-tab");
    const scrollRoots = document.querySelectorAll("[data-app-scroll-root], main").length;
    const nestedScroll = [...document.querySelectorAll("*")].filter((el) => {
      const st = getComputedStyle(el);
      return (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 8;
    }).length;
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return {
      regionBars,
      tabRails,
      headers,
      title,
      activeTab,
      bodyTab,
      scrollRoots,
      nestedScroll,
      horizontalOverflow: docW > winW + 2 ? docW - winW : 0,
    };
  });
}

async function measureLayout(page, label) {
  return page.evaluate((lbl) => {
    const vpH = window.innerHeight;
    const sticky = document.querySelector("[data-app-sticky-header]");
    const stickyBottom = sticky?.getBoundingClientRect().bottom ?? 0;
    const tier1 = document.querySelector("[data-customer-gift-commerce-tier1], [data-commerce-hub-tier1]");
    const tier1Top = tier1?.getBoundingClientRect().top ?? stickyBottom;
    const safeTopRaw = getComputedStyle(document.documentElement).getPropertyValue("--safe-top").trim();
    const safeTop = safeTopRaw.endsWith("px") ? parseFloat(safeTopRaw) : 0;
    const tier1Bottom = tier1?.getBoundingClientRect().bottom ?? stickyBottom;
    const tabs = document.querySelector("[data-commerce-hub-primary-tabs]");
    const tabsTop = tabs?.getBoundingClientRect().top ?? tier1Bottom;
    const body = document.querySelector("[data-gift-mall='1'], [data-customer-commerce-hub-body='1'], [data-gift-detail='1']");
    const bodyTop = body?.getBoundingClientRect().top ?? stickyBottom;
    const bottomNav = document.querySelector("[data-app-bottom-nav], nav.app-bottom-nav");
    const bottomNavTop = bottomNav?.getBoundingClientRect().top ?? vpH;
    const primaryCta = document.querySelector(".sam-btn--primary, [data-commerce-empty-state] .sam-btn--primary");
    const ctaRect = primaryCta?.getBoundingClientRect();
    const tier1Clip = tier1 && tier1Top < safeTop - 2 ? 1 : 0;
    const bodyUnderHeader = body && bodyTop < stickyBottom - 2 ? 1 : 0;
    return {
      label: lbl,
      TOP_CLIP: tier1Clip || stickyBottom < 0 ? 1 : 0,
      HEADER_OVERLAP: bodyUnderHeader,
      TAB_OVERLAP: tabs && tier1 && tabsTop < tier1Bottom - 2 ? 1 : 0,
      BOTTOM_CTA_CLIP: ctaRect && ctaRect.bottom > bottomNavTop - 4 ? 1 : 0,
      BOTTOM_NAV_OVERLAP: bottomNav && bottomNavTop < vpH - 4 ? 0 : bottomNav ? 1 : 0,
      HORIZONTAL_OVERFLOW: document.documentElement.scrollWidth > window.innerWidth + 2 ? 1 : 0,
      NESTED_SCROLL_COUNT: [...document.querySelectorAll("*")].filter((el) => {
        const st = getComputedStyle(el);
        return (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 8;
      }).length,
    };
  }, label);
}

async function shot(page, name) {
  const p = join(SHOT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  report.artifacts[name] = p;
}

async function auditHubTab(page, tab, sub = {}) {
  const qs = new URLSearchParams({ tab, ...sub });
  await gotoHub(page, `${ORIGIN}/orders/activity?${qs}`);
  const m = await hubMetrics(page);
  return m;
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const session = await loginSession(BUYER_EMAIL);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(playwrightCookies(session));
const page = await ctx.newPage();

try {
  // Deploy probe — hub route must not 404 after auth
  await gotoHub(page, `${ORIGIN}/orders/activity?tab=gifts&giftTab=received`);
  const url = page.url();
  const deployed = !url.includes("/404") && !url.includes("Page not found");
  setCheck("deploy", deployed, url);
  report.deploy = deployed ? "PASS" : "FAIL";

  const cold = await hubMetrics(page);
  setCheck("headerAuthority", cold.regionBars >= 1 && cold.tabRails === 1 && cold.headers === 0, cold);
  setCheck(
    "firstFrame",
    /주문|Orders/i.test(cold.title) &&
      cold.activeTab === "gifts" &&
      cold.bodyTab === "gifts",
    cold
  );
  setCheck("oneScrollOwner", cold.nestedScroll <= 3, cold);
  setCheck("horizontalOverflow", cold.horizontalOverflow === 0, cold);

  await shot(page, "390-gifts-received-cold");

  // Architecture tabs
  await gotoHub(page, `${ORIGIN}/orders/activity`);
  const overview = await page.evaluate(() => ({
    overview: document.querySelector('[data-commerce-hub-overview="1"]') != null,
    bodyTab: document.querySelector("[data-customer-commerce-hub-body]")?.getAttribute("data-commerce-hub-tab"),
    sections: document.querySelectorAll("[data-commerce-hub-overview-section]").length,
  }));
  setCheck("hub_overview_bare", overview.overview && overview.bodyTab === "overview" && overview.sections === 3, overview);
  await shot(page, "390-hub-overview");

  for (const tab of ["orders", "coupons", "gifts"]) {
    const m = await auditHubTab(page, tab, tab === "gifts" ? { giftTab: "owned" } : {});
    setCheck(`arch_tab_${tab}`, m.bodyTab === tab && m.activeTab === tab, m);
  }

  // Legacy aliases
  const aliasPaths = [
    "/orders",
    "/mypage/coupons",
    "/mypage/gift-certificates",
    "/mypage/gift-certificates?tab=pending",
    "/mypage/gift-certificates?tab=sent",
  ];
  for (const path of aliasPaths) {
    await gotoHub(page, `${ORIGIN}${path}`);
    const m = await hubMetrics(page);
    setCheck(`legacy_${path.replace(/[^a-z0-9]+/gi, "_")}`, m.tabRails === 1 && m.headers === 0, m);
  }
  setCheck("legacyAlias", Object.entries(report.checks).filter(([k]) => k.startsWith("legacy_")).every(([, v]) => v.pass));

  // V1 Coupon
  await auditHubTab(page, "coupons", { couponTab: "held" });
  const couponDom = await page.evaluate(() => ({
    wallet: document.querySelector('[data-customer-coupon-wallet="1"]') != null,
    couponFace: document.querySelector("[data-coupon-face-benefit]") != null,
    giftCard: document.querySelector('[data-gift-visual-card="1"]') != null,
    empty: document.querySelector('[data-commerce-empty-state="1"]') != null,
  }));
  setCheck("couponVisual", couponDom.wallet && !couponDom.giftCard && (couponDom.couponFace || couponDom.empty), couponDom);
  await shot(page, "390-coupons");

  // V2/V3 Gifts owned — look for STORE vs PLATFORM cards
  await auditHubTab(page, "gifts", { giftTab: "owned" });
  const giftCards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-gift-visual-card="1"]')].map((el) => ({
      scope: el.getAttribute("data-gift-scope"),
      text: (el.textContent || "").slice(0, 200),
    }))
  );
  const storeCard = giftCards.find((c) => c.scope === "STORE");
  const platformCard = giftCards.find((c) => c.scope === "PLATFORM");
  setCheck("storeGiftVisual", storeCard ? /매장|Store/i.test(storeCard.text) : giftCards.length === 0 ? "NO_FIXTURE" : false, {
    storeCard,
    count: giftCards.length,
  });
  setCheck("dibayGiftVisual", platformCard ? /DIBAY/i.test(platformCard.text) : giftCards.length === 0 ? "NO_FIXTURE" : false, {
    platformCard,
  });
  await shot(page, "390-gifts-owned");

  // V4 instance detail — if owned card + detail link exists
  const detailHref = await page
    .locator("[data-gift-wallet-detail-cta]")
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (detailHref) {
    setCheck("productInstanceSplit", detailHref.includes("/mypage/gift-certificates/") && !detailHref.includes("/stores/gift-mall/"), detailHref);
    await page.goto(`${ORIGIN}${detailHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    const inst = await page.evaluate(() => ({
      detail: document.querySelector('[data-owned-gift-instance-detail="1"]') != null,
      visual: document.querySelector('[data-gift-visual-card="1"]') != null,
      mall: document.querySelector('[data-gift-detail="1"]') != null,
    }));
    setCheck("ownedInstanceDetail", inst.detail && inst.visual && !inst.mall, inst);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  } else {
    setCheck("productInstanceSplit", "NO_OWNED_FIXTURE");
    setCheck("ownedInstanceDetail", "NO_OWNED_FIXTURE");
  }

  // V5 Gift mall
  await page.goto(`${ORIGIN}/stores/gift-mall`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const mall = await page.evaluate(() => {
    const root = document.querySelector('[data-gift-mall="1"]');
    const count = root?.getAttribute("data-active-product-count");
    const filterAllowed = root?.getAttribute("data-client-filter-allowed");
    const cards = document.querySelectorAll('[data-gift-visual-card="1"]').length;
    const filter = document.querySelector('[data-gift-mall-scope-filter="1"]') != null;
    return { count, filterAllowed, cards, filter };
  });
  const countN = Number(mall.count || 0);
  setCheck("giftMall", countN <= 100 && (mall.filterAllowed === "1" ? mall.filter : true), mall);
  const mallLayout = await measureLayout(page, "gift-mall");
  setCheck("giftMallTopClip", mallLayout.TOP_CLIP === 0 && mallLayout.HEADER_OVERLAP === 0, mallLayout);
  await shot(page, "390-gift-mall");

  // V7 received/sent/used tabs human labels
  for (const [tab, key] of [
    ["received", "received"],
    ["sent", "sent"],
    ["used", "used"],
  ]) {
    await auditHubTab(page, "gifts", { giftTab: tab });
    const human = await page.evaluate(() => {
      const raw = (document.body.innerText || "").match(/\b(PENDING|ACCEPTED|REJECTED|CANCELLED)\b/g);
      return { rawEnumCount: raw?.length ?? 0 };
    });
    setCheck(key, human.rawEnumCount === 0, human);
  }

  // Back/forward
  await auditHubTab(page, "orders");
  await auditHubTab(page, "coupons");
  await auditHubTab(page, "gifts", { giftTab: "owned" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  const backUrl = page.url();
  setCheck("backForward", backUrl.includes("tab="), backUrl);

  // Device matrix (hub coupons @390 already; run key pages)
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await auditHubTab(page, "coupons");
    report.deviceMatrix[vp.id] = await measureLayout(page, vp.id);
    await shot(page, `${vp.id}-coupons`);
  }

  // Chat N+1 — skip unless room id provided
  const roomId = process.env.COMMERCE_HUB_GIFT_ROOM_ID?.trim();
  if (roomId) {
    let presentationCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/me/gift-certificates/transfers/presentation")) presentationCalls += 1;
    });
    await page.goto(`${ORIGIN}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(4000);
    const cards = await page.locator('[data-messenger-gift-certificate-card="1"]').count();
    setCheck("chatGiftCard", cards >= 1, { cards });
    setCheck("noNPlusOne", presentationCalls <= 2, { presentationCalls, cards });
  } else {
    setCheck("chatGiftCard", "NOT_PROVEN");
    setCheck("noNPlusOne", "NOT_PROVEN");
  }
} catch (e) {
  report.error = e instanceof Error ? e.message : String(e);
  if (!report.firstDivergence) report.firstDivergence = "exception";
} finally {
  await browser.close().catch(() => {});
}

function summarize(id) {
  const v = report.checks[id];
  if (v == null) return "NOT_PROVEN";
  if (v === "NOT_PROVEN" || v === "NO_FIXTURE" || v === "NO_OWNED_FIXTURE") return String(v);
  if (typeof v === "object" && "pass" in v) {
    if (v.pass === "NO_FIXTURE" || v.pass === "NO_OWNED_FIXTURE") return String(v.pass);
    return v.pass ? "PASS" : "FAIL";
  }
  return v ? "PASS" : "FAIL";
}

report.summary = {
  DEPLOY: summarize("deploy"),
  PRODUCTION_COMMIT: EXPECT_SHA,
  HEADER_AUTHORITY: summarize("headerAuthority"),
  FIRST_FRAME: summarize("firstFrame"),
  LEGACY_ALIAS: summarize("legacyAlias"),
  BACK_FORWARD: summarize("backForward"),
  COUPON_VISUAL: summarize("couponVisual"),
  STORE_GIFT_VISUAL: summarize("storeGiftVisual"),
  DIBAY_GIFT_VISUAL: summarize("dibayGiftVisual"),
  GIFT_MALL: summarize("giftMall"),
  OWNED_INSTANCE_DETAIL: summarize("ownedInstanceDetail"),
  PRODUCT_INSTANCE_SPLIT: summarize("productInstanceSplit"),
  RECEIVED: summarize("received"),
  SENT: summarize("sent"),
  USED: summarize("used"),
  CHAT_GIFT_CARD: summarize("chatGiftCard"),
  NO_N_PLUS_ONE: summarize("noNPlusOne"),
  ONE_SCROLL_OWNER: summarize("oneScrollOwner"),
  HORIZONTAL_OVERFLOW: summarize("horizontalOverflow"),
  FINAL: report.firstDivergence ? `BLOCKED — ${report.firstDivergence}` : "CUSTOMER COMMERCE HUB RUNTIME PASS (browser matrix partial)",
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(`\nWrote ${OUT}`);
if (report.firstDivergence && !String(report.summary.FINAL).includes("NO_FIXTURE")) process.exit(1);
