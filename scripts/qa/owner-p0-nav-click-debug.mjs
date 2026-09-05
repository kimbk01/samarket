import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const rel of [".env.local", ".env"]) {
  const p = resolve(rel);
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

const ORIGIN = "http://localhost:3000";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
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
const context = await browser.newContext();
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
    domain: "localhost",
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${ORIGIN}/stores/owner?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => !!document.querySelector('nav.owner-mobile-bottom-nav a[href*="/orders"]'),
  null,
  { timeout: 60000 }
);
await page.waitForTimeout(400);

const hit = await page.evaluate(() => {
  const a = document.querySelector('nav.owner-mobile-bottom-nav a[href*="/orders"]');
  const r = a.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    href: a.getAttribute("href"),
    hit: el
      ? el.closest("a")?.getAttribute("href") || `${el.tagName}.${String(el.className || "").slice(0, 80)}`
      : null,
  };
});
console.log("hit", JSON.stringify(hit));

const orders = page.locator('nav.owner-mobile-bottom-nav a[href*="/stores/owner/orders"]');
await orders.click({ timeout: 5000 });
try {
  await page.waitForURL((url) => url.pathname.includes("/stores/owner/orders"), { timeout: 5000 });
  console.log("PASS", page.url());
} catch {
  console.log("NO_NAV", page.url());
  const href = await orders.getAttribute("href");
  await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  console.log("GOTO", page.url());
  const active = await page.locator('nav.owner-mobile-bottom-nav a[href*="/orders"]').getAttribute("data-active");
  console.log("orders_active_after_goto", active);
}
await browser.close();
