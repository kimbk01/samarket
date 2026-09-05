/**
 * Dump product-new form fields for QA selector wiring.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = "https://samarket.vercel.app";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OUT = resolve("docs/perf/owner-store-os-complete/recovery");
mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data } = await sb.auth.signInWithPassword({ email: "sadads@adsasdsa.com", password: "1234" });
const session = data.session;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
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
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "samarket.vercel.app",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
await page.goto(`${ORIGIN}/stores/owner/products/new?storeId=${STORE}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(3500);
const dump = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll("input,textarea,select")].map((el) => ({
    tag: el.tagName,
    type: el.getAttribute("type"),
    name: el.getAttribute("name"),
    id: el.id,
    placeholder: el.getAttribute("placeholder"),
    aria: el.getAttribute("aria-label"),
  }));
  const buttons = [...document.querySelectorAll("button")]
    .map((b) => (b.innerText || "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 25);
  return { url: location.href, inputs, buttons, sample: (document.body.innerText || "").slice(0, 1500) };
});
writeFileSync(resolve(OUT, "product-new-dom.json"), JSON.stringify(dump, null, 2));
await page.screenshot({ path: resolve(OUT, "product-new-dom.png") });
console.log(JSON.stringify(dump, null, 2));
await browser.close();
