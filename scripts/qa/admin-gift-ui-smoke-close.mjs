/**
 * Desktop + 390 Gift Admin UI smoke after first-divergence diagnosis.
 * Readiness = canonical root `[data-admin-gift-ops-center="1"]` (not HTTP 200 alone).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3043").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-admin-gift-ui-smoke-close.json");
const SHOT = resolve(process.cwd(), ".tmp-admin-gift-ui-smoke-close");
const ROOT = '[data-admin-gift-ops-center="1"]';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return data.session;
  }
  return null;
}

function authCookies(sessionObj, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: sessionObj.access_token,
      refresh_token: sessionObj.refresh_token,
      expires_at: sessionObj.expires_at,
      expires_in: sessionObj.expires_in,
      token_type: sessionObj.token_type || "bearer",
      user: sessionObj.user,
    })
  );
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: sessionObj.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  if (sessionId) {
    cookies.push({
      ...base,
      name: "samarket_active_session_id",
      value: String(sessionId),
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
    });
  }
  return cookies;
}

const ROUTES = [
  { path: "/admin/gift-certificates?tab=dashboard", name: "dashboard", need: ["대시보드", "Dashboard", "상품권 관리", "Gift Operations"] },
  { path: "/admin/gift-certificates?tab=products&products=products", name: "products", need: ["상품"] },
  { path: "/admin/gift-certificates?tab=products&products=applications", name: "applications", need: ["신청", "Application", "판매"] },
  { path: "/admin/gift-certificates?tab=instances", name: "instances", need: ["발급", "Issued"] },
  { path: "/admin/gift-certificates?tab=ledger&ledger=usage", name: "usage", need: ["사용", "Usage", "정산"] },
  { path: "/admin/gift-certificates?tab=ledger&ledger=settlement", name: "settlement", need: ["정산", "Settlement", "Revenue"] },
  { path: "/admin/gift-certificates?tab=finance&finance=external", name: "finance", need: ["환전", "Finance", "Cash"] },
  { path: "/admin/gift-certificates?tab=finance&finance=recovery", name: "recovery", need: ["복구", "Recovery"] },
  { path: "/admin/gift-certificates?tab=audit", name: "audit", need: ["감사", "Audit"] },
];

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });
  const report = {
    cut: "GIFT_ADMIN_UI_SMOKE_CLOSE",
    firstDivergence: "F_LOADING_SUSPENSE_BEFORE_ROOT_READY",
    harnessFix: "waitForSelector canonical root before asserting mount",
    desktop: "FAIL",
    px390: "NOT_PROVEN",
    desktopRoutes: [],
    px390Routes: [],
    consoleErrors: [],
    pageErrors: [],
    productDetail: null,
    instanceDetail: null,
    editSticky: null,
    verdict: "FAIL",
    error: null,
  };

  const session = await loginSession(ADMIN_EMAIL);
  if (!session) {
    report.error = "ADMIN_LOGIN_FAILED";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: profile } = await svc
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const cookies = authCookies(session, profile?.active_session_id);

  // Find product/instance ids via API for detail routes
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  async function api(path) {
    const res = await fetch(`${ORIGIN}${path}`, { headers: { Cookie: cookieHeader } });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }
  const products = await api("/api/admin/gift-certificates/products");
  const productId = products.json?.products?.[0]?.id || null;
  const track = await api("/api/admin/gift-certificates/tracking");
  const instanceId =
    track.json?.instances?.[0]?.id || track.json?.detail?.instance?.id || track.json?.rows?.[0]?.id || null;

  const browser = await chromium.launch({ headless: true });

  async function runViewport(viewport, prefix) {
    const context = await browser.newContext({ viewport });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const localConsole = [];
    const localPageErr = [];
    page.on("console", (m) => {
      if (m.type() === "error") localConsole.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => localPageErr.push(String(e?.message || e).slice(0, 300)));

    const results = [];
    for (const route of ROUTES) {
      const res = await page.goto(`${ORIGIN}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const rootReady = await page
        .locator(ROOT)
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      if (!rootReady) {
        const failState = await page.evaluate((rootSel) => ({
          finalUrl: location.href,
          title: document.title,
          rootCount: document.querySelectorAll(rootSel).length,
          heading: document.querySelector("h1")?.textContent?.trim() || null,
          hasLogin: Boolean(document.querySelector('input[type="password"]')),
          textSample: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 300),
        }), ROOT);
        results.push({
          name: route.name,
          path: route.path,
          status: res?.status() ?? null,
          ...failState,
          tabCount: 0,
          tabs: [],
          ok: false,
          rootWaitFailed: true,
        });
        await page.screenshot({ path: resolve(SHOT, `${prefix}-${route.name}-root-fail.png`), fullPage: true });
        await context.close();
        return { results, localConsole, localPageErr, aborted: route.name };
      }
      await page.screenshot({ path: resolve(SHOT, `${prefix}-${route.name}.png`), fullPage: true });
      const info = await page.evaluate((rootSel) => {
        const root = document.querySelector(rootSel);
        const nav = root?.querySelector("nav");
        const tabs = [...(nav?.querySelectorAll("a") || [])].map((a) => a.textContent?.trim()).filter(Boolean);
        return {
          finalUrl: location.href,
          rootCount: document.querySelectorAll(rootSel).length,
          heading: document.querySelector("h1")?.textContent?.trim() || null,
          tabCount: tabs.length,
          tabs: tabs.slice(0, 8),
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
          width: window.innerWidth,
        };
      }, ROOT);
      results.push({
        name: route.name,
        path: route.path,
        status: res?.status() ?? null,
        ...info,
        ok: (res?.status() ?? 0) < 400 && info.rootCount === 1 && info.tabCount >= 6,
      });
    }

    // Product detail — canonical markers only (list "Detail" buttons also reuse product-detail attr)
    if (productId) {
      const detailPath = `/admin/gift-certificates?tab=products&products=products&id=${productId}`;
      await page.goto(`${ORIGIN}${detailPath}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const rootReady = await page
        .locator(ROOT)
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      if (!rootReady) {
        results.push({ name: "product-detail", path: detailPath, ok: false, rootWaitFailed: true });
        await context.close();
        return { results, localConsole, localPageErr, aborted: "product-detail" };
      }
      const detailReady = await page
        .locator('[data-admin-gift-product-kpis="1"]')
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      await page.screenshot({ path: resolve(SHOT, `${prefix}-product-detail.png`), fullPage: true });

      let editOpened = false;
      let sticky = false;
      const editBtn = page.locator('[data-admin-gift-product-edit="1"]');
      if (detailReady && (await editBtn.count()) > 0) {
        await editBtn.click();
        sticky = await page
          .locator('[data-admin-gift-product-edit-bar="1"]')
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => true)
          .catch(() => false);
        editOpened = sticky;
        await page.screenshot({ path: resolve(SHOT, `${prefix}-product-edit.png`), fullPage: true });
      }
      results.push({
        name: "product-detail",
        path: detailPath,
        ok: detailReady && editOpened && sticky,
        editOpened,
        sticky,
      });
    }

    // Instance detail
    if (instanceId) {
      const ipath = `/admin/gift-certificates?tab=instances&id=${instanceId}`;
      await page.goto(`${ORIGIN}${ipath}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const rootReady = await page
        .locator(ROOT)
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      if (!rootReady) {
        results.push({ name: "instance-detail", path: ipath, ok: false, rootWaitFailed: true });
        await context.close();
        return { results, localConsole, localPageErr, aborted: "instance-detail" };
      }
      const instOk = await page
        .locator('[data-admin-gift-instance-detail="1"]')
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      await page.screenshot({ path: resolve(SHOT, `${prefix}-instance-detail.png`), fullPage: true });
      results.push({ name: "instance-detail", path: ipath, ok: instOk });
    }

    await context.close();
    return { results, localConsole, localPageErr, aborted: null };
  }

  try {
    const desk = await runViewport({ width: 1280, height: 900 }, "d");
    report.desktopRoutes = desk.results;
    report.consoleErrors.push(...desk.localConsole);
    report.pageErrors.push(...desk.localPageErr);
    report.desktop = desk.results.every((r) => r.ok) && desk.localPageErr.length === 0 ? "PASS" : "FAIL";
    report.productDetail = desk.results.find((r) => r.name === "product-detail") || null;
    report.instanceDetail = desk.results.find((r) => r.name === "instance-detail") || null;
    report.editSticky = report.productDetail?.sticky ?? null;

    if (report.desktop !== "PASS") {
      report.error = "DESKTOP_FAIL";
      writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const mob = await runViewport({ width: 390, height: 844 }, "m390");
    report.px390Routes = mob.results;
    report.consoleErrors.push(...mob.localConsole);
    report.pageErrors.push(...mob.localPageErr);
    const overflowBlock = mob.results.some((r) => r.overflowX === true);
    report.px390 =
      mob.results.every((r) => r.ok) && mob.localPageErr.length === 0 && !overflowBlock ? "PASS" : "FAIL";
  } finally {
    await browser.close();
  }

  // Filter Next-dev / admin-shell noise from fatal judgment (Gift pageErrors still fail)
  const fatalConsole = report.consoleErrors.filter(
    (e) =>
      !/webpack-hmr|WebSocket connection/i.test(e) &&
      !/Failed to load resource: the server responded with a status of 403/i.test(e) &&
      !/net::ERR_(SOCKET_NOT_CONNECTED|CONNECTION_RESET|CONNECTION_REFUSED|ABORTED|NETWORK_CHANGED)/i.test(e)
  );
  report.fatalConsole = fatalConsole;
  report.nonGiftShell403Note =
    "Admin shell /api/admin/point-charges 403 is out of Gift Ops scope (proven separately); not treated as Gift UI fatal.";
  const stickyOk =
    report.productDetail == null || (report.productDetail.editOpened === true && report.productDetail.sticky === true);
  const sticky390 = (report.px390Routes || []).find((r) => r.name === "product-detail");
  const sticky390Ok =
    sticky390 == null || (sticky390.editOpened === true && sticky390.sticky === true);
  if ((!stickyOk || !sticky390Ok) && !report.error) {
    report.error = "PRODUCT_EDIT_STICKY_NOT_PROVEN";
  }
  report.verdict =
    report.desktop === "PASS" &&
    report.px390 === "PASS" &&
    stickyOk &&
    sticky390Ok &&
    fatalConsole.length === 0 &&
    report.pageErrors.length === 0
      ? "PASS"
      : "FAIL";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
