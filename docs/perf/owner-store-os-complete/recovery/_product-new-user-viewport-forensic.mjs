/**
 * Product New blank forensic — USER VIEWPORT authority.
 * No fill()/force. Measure visibility only.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   docs/perf/owner-store-os-complete/recovery/_product-new-user-viewport-forensic.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const OUT_DIR = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");
const EXPECTED_HEAD = "a5f78fe24";

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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))];
}

function cookieValue(session) {
  return encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
}

async function login(sb, email) {
  for (const pw of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

async function activeSessionId(admin, userId) {
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return data?.active_session_id ? String(data.active_session_id) : "";
}

async function addAuthCookies(context, admin, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const domain = new URL(ORIGIN).hostname;
  const secure = !(domain === "127.0.0.1" || domain === "localhost");
  const active = await activeSessionId(admin, session.user.id);
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: cookieValue(session),
      domain,
      path: "/",
      httpOnly: false,
      secure,
      sameSite: "Lax",
    },
  ];
  if (active) {
    cookies.push({
      name: "samarket_active_session_id",
      value: active,
      domain,
      path: "/",
      httpOnly: false,
      secure,
      sameSite: "Lax",
    });
  }
  await context.addCookies(cookies);
}

loadEnv();
mkdirSync(OUT_DIR, { recursive: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("missing_supabase_env");

const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const session = await login(sb, OWNER_EMAIL);

const viewports = [
  { name: "user_desktop_like", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const report = {
  at: new Date().toISOString(),
  origin: ORIGIN,
  expectedHead: EXPECTED_HEAD,
  storeId: STORE,
  viewports: {},
};

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent:
      vp.width >= 1024
        ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await addAuthCookies(context, admin, session);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

  const target = `${ORIGIN}/stores/owner/products/new?storeId=${STORE}`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(6000);

  const shot = resolve(OUT_DIR, `product-new-blank-${vp.name}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const measure = await page.evaluate(() => {
    const qs = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    };
    const cs = (el) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      return {
        display: c.display,
        visibility: c.visibility,
        overflow: c.overflow,
        overflowY: c.overflowY,
        height: c.height,
        maxHeight: c.maxHeight,
        flex: c.flex,
        flexBasis: c.flexBasis,
        minHeight: c.minHeight,
      };
    };
    const form = qs("#owner-product-form");
    const scroll = qs("[data-owner-product-form-scroll]");
    const composer = qs("[data-owner-product-composer]");
    const main = qs("main");
    const header = qs("header") || qs("[data-owner-header]") || qs(".owner-ops-drawer-topbar");
    const nameInput =
      qs('#owner-product-form input[name="name"]') ||
      qs('#owner-product-form input[name="product_name"]') ||
      qs("#owner-product-form input");

    const bodyText = (document.body?.innerText || "").slice(0, 500);
    const titleText = document.title;

    let scrollProbe = null;
    if (scroll) {
      const before = scroll.scrollTop;
      scroll.scrollTop = 400;
      const after = scroll.scrollTop;
      scroll.scrollTop = before;
      scrollProbe = {
        clientHeight: scroll.clientHeight,
        scrollHeight: scroll.scrollHeight,
        scrollTopBefore: before,
        scrollTopAfterSet400: after,
        canUserScroll: scroll.scrollHeight > scroll.clientHeight + 8 && after > before,
      };
    }

    const buildId =
      document.querySelector('meta[name="vercel-deployment-url"]')?.content ||
      document.querySelector("script[data-nextjs-build-id]")?.getAttribute("data-nextjs-build-id") ||
      null;

    return {
      href: location.href,
      titleText,
      bodyLead: bodyText,
      hasForm: Boolean(form),
      hasNameInput: Boolean(nameInput),
      nameVisible: Boolean(nameInput && nameInput.getBoundingClientRect().height > 0),
      formRect: rect(form),
      scrollRect: rect(scroll),
      composerRect: rect(composer),
      mainRect: rect(main),
      headerRect: rect(header),
      formCss: cs(form),
      scrollCss: cs(scroll),
      composerCss: cs(composer),
      mainCss: cs(main),
      scrollProbe,
      buildId,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });

  // Try to read /_vercel/insights or next data for deployment — also fetch build id from page HTML
  const htmlMeta = await page.evaluate(() => {
    const nextData = document.getElementById("__NEXT_DATA__");
    let buildId = null;
    try {
      buildId = nextData ? JSON.parse(nextData.textContent || "{}").buildId : null;
    } catch {
      buildId = null;
    }
    return { buildId };
  });

  report.viewports[vp.name] = {
    viewport: vp,
    screenshot: shot,
    consoleErrors: consoleErrors.slice(0, 20),
    pageErrors: pageErrors.slice(0, 10),
    measure: { ...measure, nextBuildId: htmlMeta.buildId },
    humanUsable:
      Boolean(measure.hasForm) &&
      Boolean(measure.nameVisible) &&
      (measure.scrollProbe?.clientHeight ?? 0) > 80 &&
      (measure.formRect?.h ?? 0) > 80,
  };

  await context.close();
}

writeFileSync(resolve(OUT_DIR, "product-new-user-viewport-forensic.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(report.viewports).map(([k, v]) => [
        k,
        {
          humanUsable: v.humanUsable,
          formH: v.measure.formRect?.h,
          scrollClientH: v.measure.scrollProbe?.clientHeight,
          nameVisible: v.measure.nameVisible,
          bodyLead: v.measure.bodyLead.slice(0, 120),
        },
      ])
    ),
    null,
    2
  )
);
await browser.close();
