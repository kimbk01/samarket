/**
 * Owner Store OS — Drawer + Bell vs Hamburger behavioral proof.
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/owner-store-os-drawer-behavioral-proof.mjs
 *
 * PASS only when:
 * - hamburger opens drawer root (not notification)
 * - anchors collected FROM drawer root only
 * - bell opens notification panel with drawer closed
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");

const REQUIRED_HREF_PARTS = [
  { id: "dashboard", re: /\/stores\/owner(\?|$)/ },
  { id: "orders", re: /\/stores\/owner\/orders/ },
  { id: "ops_status", re: /\/stores\/owner\/ops-status/ },
  { id: "products", re: /\/stores\/owner\/products(\?|$)/ },
  { id: "product_new", re: /\/stores\/owner\/products\/new/ },
  { id: "categories", re: /\/stores\/owner\/menu-categories/ },
  { id: "customer_care", re: /\/stores\/owner\/customer-care(\?|$)/ },
  { id: "order_chats", re: /\/stores\/owner\/order-chats/ },
  { id: "inquiries", re: /\/stores\/owner\/inquiries/ },
  { id: "reviews", re: /\/stores\/owner\/reviews/ },
  { id: "basic_info", re: /\/stores\/owner\/basic-info/ },
  { id: "profile", re: /\/stores\/owner\/profile/ },
  { id: "finance", re: /\/stores\/owner\/finance/ },
  { id: "settlements", re: /\/stores\/owner\/settlements/ },
  { id: "coupons", re: /\/stores\/owner\/coupons/ },
  { id: "gift", re: /\/stores\/owner\/gift-certificates/ },
  { id: "banners", re: /\/stores\/owner\/banners/ },
  { id: "notices", re: /\/stores\/owner\/notices/ },
  { id: "ads", re: /\/stores\/owner\/ads/ },
  { id: "customer_center", re: /\/stores\/owner\/customer-care\/customer-center/ },
  { id: "settings", re: /\/stores\/owner\/settings/ },
];

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

async function dismiss(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape").catch(() => null);
    await page.waitForTimeout(150);
  }
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const passwords = [
  ...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean)),
];
let session = null;
for (const pw of passwords) {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: pw });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
if (!session) throw new Error("owner login failed");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const domain = new URL(ORIGIN).hostname;
const secure = ORIGIN.startsWith("https");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addCookies([
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
    domain,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure,
          sameSite: "Lax",
        },
      ]
    : []),
]);

const page = await context.newPage();
await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);
await dismiss(page);

const report = {
  origin: ORIGIN,
  storeId: STORE,
  checkedAt: new Date().toISOString(),
  bellVsHamburger: { status: "FAIL" },
  drawerMap: { status: "FAIL", anchors: [], missing: [] },
};

// --- BELL ---
const bellBtn = page
  .locator("[data-owner-notification-bell], [data-tier1-notification-bell], button[aria-label]")
  .filter({ has: page.locator("svg") })
  .filter({ hasNot: page.locator("[data-owner-ops-menu-trigger]") });
// Prefer explicit bell; fallback: header action before hamburger (notifications aria)
let bellClicked = false;
if ((await page.locator("[data-owner-notification-bell], [data-tier1-notification-bell]").count()) > 0) {
  await page.locator("[data-owner-notification-bell], [data-tier1-notification-bell]").first().click({ force: true });
  bellClicked = true;
} else {
  const byAria = page.getByRole("button", { name: /notification|알림|Notifications/i });
  if ((await byAria.count()) > 0) {
    await byAria.first().click({ force: true });
    bellClicked = true;
  }
}
if (!bellClicked) throw new Error("notification bell control not found");
await page.waitForTimeout(800);
const bellState = await page.evaluate(() => {
  const notif =
    document.querySelector(
      "[data-owner-notification-panel], [data-tier1-notification-panel], .tier1-notification-inbox-popup--open, [class*='tier1-notification-inbox-popup']"
    ) != null;
  const drawerPanel = document.querySelector(".owner-ops-drawer-panel[data-open='true']");
  const drawerVisible = Boolean(drawerPanel);
  return { notif, drawerVisible };
});
await page.screenshot({ path: resolve(OUT, "bell-open.png"), fullPage: false });
await dismiss(page);
await page.waitForTimeout(400);

// --- HAMBURGER ---
const hamburger =
  (await page.locator("[data-owner-ops-menu-trigger]").count()) > 0
    ? page.locator("[data-owner-ops-menu-trigger]").first()
    : page.getByRole("button", { name: /menu|메뉴|open menu|운영/i }).first();
await hamburger.click({ force: true });
await page.waitForTimeout(900);
const drawerState = await page.evaluate(() => {
  const root = document.querySelector("[data-owner-ops-drawer-root]");
  const panel = document.querySelector(".owner-ops-drawer-panel");
  const el = panel || root;
  if (!el) return { open: false, anchors: [], notif: false };
  const openAttr = panel?.getAttribute("data-open") === "true" || root?.getAttribute("data-open") === "true";
  const st = window.getComputedStyle(panel || el);
  const open =
    openAttr ||
    (st.display !== "none" &&
      st.visibility !== "hidden" &&
      Number(st.opacity || "1") > 0.05 &&
      el.getBoundingClientRect().width > 40);
  const scope = root || el;
  const anchors = [...scope.querySelectorAll("a[href]")].map((a) => ({
    href: a.getAttribute("href") || "",
    label: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
  }));
  const notif =
    document.querySelector(
      "[data-owner-notification-panel], .tier1-notification-inbox-popup--open"
    ) != null;
  return { open, anchors, notif, sample: (scope.innerText || "").slice(0, 400) };
});
await page.screenshot({ path: resolve(OUT, "drawer-open.png"), fullPage: false });

report.bellVsHamburger = {
  status: bellState.notif && !bellState.drawerVisible && drawerState.open && !drawerState.notif ? "PASS" : "FAIL",
  bell: bellState,
  hamburger: { open: drawerState.open, notifWhileOpen: drawerState.notif },
};

const missing = REQUIRED_HREF_PARTS.filter((r) => !drawerState.anchors.some((a) => r.re.test(a.href))).map((r) => r.id);
report.drawerMap = {
  status: drawerState.open && missing.length === 0 ? "PASS" : "FAIL",
  open: drawerState.open,
  anchors: drawerState.anchors,
  missing,
  sample: drawerState.sample,
};

writeFileSync(resolve(OUT, "drawer-behavioral-proof.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.bellVsHamburger.status === "PASS" && report.drawerMap.status === "PASS" ? 0 : 1);
