/**
 * Probe: does /stores/owner/customer-care stay on hub or fall into /inquiries?
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/owner-store-os-customer-care-probe.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");

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
const hops = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) hops.push({ t: Date.now(), url: f.url() });
});

const target = `${ORIGIN}/stores/owner/customer-care?storeId=${STORE}`;
await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(5000);

const hub = await page.locator("[data-owner-customer-care-hub]").count();
const entries = await page.locator("[data-owner-care-entry]").evaluateAll((els) =>
  els.map((el) => ({
    id: el.getAttribute("data-owner-care-entry"),
    href: el.getAttribute("href"),
  }))
);
const customersHref = await page
  .locator('nav a[href*="customer-care"], [data-owner-bottom-nav] a[href*="customer-care"]')
  .evaluateAll((els) => els.map((el) => el.getAttribute("href")))
  .catch(() => []);
const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 800);

const report = {
  origin: ORIGIN,
  target,
  finalUrl: page.url(),
  hubCount: hub,
  entries,
  customersHref,
  hops,
  bodySample: body,
  verdict:
    /\/customer-care(\?|$)/.test(page.url()) && hub > 0
      ? "PASS_STAYS_ON_HUB"
      : /\/inquiries(\?|$)/.test(page.url())
        ? "FAIL_REDIRECT_TO_INQUIRIES"
        : "FAIL_OTHER",
};

await page.screenshot({ path: resolve(OUT, "probe-customer-care.png"), fullPage: false });
writeFileSync(resolve(OUT, "probe-customer-care.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();

// ---- bottom-nav click path (appended second run when PROBE_NAV=1) ----
