import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
loadEnv();
const ORIGIN = "https://samarket.vercel.app";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
let session = null;
for (const pw of [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))]) {
  const { data, error } = await sb.auth.signInWithPassword({ email: "sadads@adsasdsa.com", password: pw });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
    domain: "samarket.vercel.app",
    path: "/",
    secure: true,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [{ name: "samarket_active_session_id", value: String(pr.active_session_id), domain: "samarket.vercel.app", path: "/", secure: true, sameSite: "Lax" }]
    : []),
]);
const page = await context.newPage();
await page.goto(`${ORIGIN}/stores/owner/products/new?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(3000);
const m = await page.evaluate(() => {
  const header = document.querySelector("header");
  const main = document.querySelector("main.owner-compact-shell__main");
  const scroll = document.querySelector(".owner-compact-shell__scroll");
  const sticky = document.querySelector("[data-owner-product-composer] .sticky");
  const cs = getComputedStyle(main);
  const body = getComputedStyle(document.body);
  return {
    headerBottom: Math.round(header.getBoundingClientRect().bottom),
    headerH: Math.round(header.getBoundingClientRect().height),
    mainPadTop: cs.paddingTop,
    mainTop: Math.round(main.getBoundingClientRect().top),
    scrollTop: Math.round(scroll.getBoundingClientRect().top),
    stickyTop: sticky ? Math.round(sticky.getBoundingClientRect().top) : null,
    vars: {
      contentTop: body.getPropertyValue("--owner-content-top").trim(),
      mainPt: body.getPropertyValue("--owner-shell-main-pt").trim(),
      headerH: body.getPropertyValue("--owner-header-height").trim(),
      border: body.getPropertyValue("--owner-shell-header-border").trim(),
      safeTop: body.getPropertyValue("--owner-safe-top").trim() || body.getPropertyValue("--safe-top").trim(),
    },
  };
});
console.log(JSON.stringify(m, null, 2));
await browser.close();
