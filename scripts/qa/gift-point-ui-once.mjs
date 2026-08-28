/**
 * One-shot: prove Gift Detail UI point == /api/me/points (no reload loop).
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app npx tsx --env-file=.env.local scripts/qa/gift-point-ui-once.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const PRODUCT = "2901c35b-6a56-4fb1-a9dd-029263780364";
const BUYER = "wwww@manual.local";
const OUT = resolve(process.cwd(), ".tmp-gift-point-ui-once.json");

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

const passwords = [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
const sbAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let session = null;
for (const password of passwords) {
  const { data, error } = await sbAnon.auth.signInWithPassword({ email: BUYER, password });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
if (!session) throw new Error("login_failed");

const { data: pr } = await sb.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const origin = new URL(ORIGIN);
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
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: origin.hostname,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: origin.protocol === "https:",
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();

const { adjustUserPoints } = await import("../../lib/points/user-point-ledger.ts");
const api0 = await page.request.get(`${ORIGIN}/api/me/points`);
const j0 = await api0.json();
const cur = Math.trunc(Number(j0?.balance ?? 0) || 0);
if (cur < 1000) {
  const { data: admin } = await sbAnon.auth.signInWithPassword({
    email: "aaaa@manual.local",
    password: passwords[0],
  });
  // try passwords for admin
  let adminId = admin?.user?.id;
  if (!adminId) {
    for (const password of passwords) {
      const r = await sbAnon.auth.signInWithPassword({ email: "aaaa@manual.local", password });
      if (r.data?.user?.id) {
        adminId = r.data.user.id;
        break;
      }
    }
  }
  await adjustUserPoints(sb, {
    userId: session.user.id,
    delta: 1000 - cur,
    description: "point ui once credit",
    actorUserId: adminId || session.user.id,
  });
}

await page.goto(`${ORIGIN}/stores/gift-mall/${PRODUCT}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector('[data-gift-detail="1"][data-ready="1"]', { timeout: 60000 });
await page.waitForSelector('[data-gift-point-panel="1"]', { timeout: 30000 });
// wait until loading ellipsis clears (one settle, not reload loop)
for (let i = 0; i < 40; i++) {
  const t = await page.locator('[data-gift-point-panel="1"]').innerText();
  if (!t.includes("…")) break;
  await page.waitForTimeout(250);
}

const apiRes = await page.request.get(`${ORIGIN}/api/me/points`);
const apiJ = await apiRes.json();
const pointApi = Math.trunc(Number(apiJ?.balance ?? 0) || 0);
const panel = await page.locator('[data-gift-point-panel="1"]').innerText();
const m = panel.match(/(?:Your D-Point|보유\s*D-Point)[^\d]*([\d,]+)/i);
const pointUi = m ? Math.trunc(Number(m[1].replace(/,/g, "")) || 0) : null;
const buy = (await page.locator('[data-gift-detail-buy-cta="1"]').count()) > 0;

const report = {
  pointApi,
  pointUi,
  buyCta: buy,
  match: pointApi > 0 && pointUi === pointApi,
  panel: panel.slice(0, 200),
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.match) process.exitCode = 1;
