/**
 * ONE navigation diagnosis — Gift Admin UI smoke first divergence.
 * Does not fix. Does not rerun DB/API matrix.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3043").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-admin-gift-ui-first-divergence.json");
const SHOT = resolve(process.cwd(), ".tmp-admin-gift-ui-first-divergence");
const TARGET = "/admin/gift-certificates?tab=dashboard";
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

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });

  const report = {
    cut: "GIFT_ADMIN_UI_FIRST_DIVERGENCE",
    requestedUrl: `${ORIGIN}${TARGET}`,
    authLogin: null,
    finalUrl: null,
    status: null,
    title: null,
    pathname: null,
    search: null,
    heading: null,
    bodyClass: null,
    rootCount: null,
    rootCountStrict: null,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    responses: [],
    classification: null,
    htmlSnippet: null,
  };

  const session = await loginSession(ADMIN_EMAIL);
  report.authLogin = session ? "USABLE" : "FAIL";
  if (!session) {
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("pageerror", (err) => {
    report.pageErrors.push(String(err?.message || err).slice(0, 500));
  });
  page.on("requestfailed", (req) => {
    report.failedRequests.push({
      url: req.url().slice(0, 300),
      failure: req.failure()?.errorText || null,
    });
  });
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes("/admin") && !u.includes("/api/admin/gift")) return;
    if (report.responses.length >= 40) return;
    report.responses.push({ url: u.slice(0, 300), status: res.status() });
  });

  const res = await page.goto(`${ORIGIN}${TARGET}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  report.status = res?.status() ?? null;
  report.finalUrl = page.url();

  // Give client mount a short bounded window without artificial long sleeps as "fix"
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);

  const state = await page.evaluate(() => {
    const root = document.querySelector("[data-admin-gift-ops-center]");
    const rootStrict = document.querySelector('[data-admin-gift-ops-center="1"]');
    const h1 = document.querySelector("h1");
    return {
      title: document.title,
      pathname: location.pathname,
      search: location.search,
      heading: h1?.textContent?.trim()?.slice(0, 120) || null,
      bodyClass: document.body?.className || null,
      rootCount: document.querySelectorAll("[data-admin-gift-ops-center]").length,
      rootCountStrict: document.querySelectorAll('[data-admin-gift-ops-center="1"]').length,
      hasLoginForm: Boolean(document.querySelector('input[type="password"], [data-login]')),
      textSample: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400),
      htmlHasOpsCenterString: (document.documentElement?.innerHTML || "").includes("data-admin-gift-ops-center"),
      rootPresent: Boolean(root || rootStrict),
    };
  });

  Object.assign(report, state);
  await page.screenshot({ path: resolve(SHOT, "first-nav.png"), fullPage: true });

  // Classification
  if (/\/login|\/signin|\/auth/i.test(report.finalUrl || "") || state.hasLoginForm) {
    report.classification = "B_AUTH_REDIRECT";
  } else if ((report.finalUrl || "").includes("/admin/gift-certificates") === false) {
    report.classification = "C_LEGACY_OR_WRONG_ROUTE";
  } else if (state.htmlHasOpsCenterString && !state.rootPresent) {
    report.classification = "G_HYDRATION_OR_SELECTOR_TIMING";
  } else if (!state.htmlHasOpsCenterString && state.heading) {
    report.classification = "D_ADMIN_SHELL_WITHOUT_OPS_CENTER";
  } else if (report.pageErrors.length) {
    report.classification = "E_CLIENT_CRASH";
  } else if (!state.rootPresent) {
    report.classification = "I_RUNTIME_OR_MOUNT_FAILURE";
  } else {
    report.classification = "ROOT_PRESENT";
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
