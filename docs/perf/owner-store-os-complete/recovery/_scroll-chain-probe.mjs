/**
 * One-shot Production scroll height chain probe (390).
 * node --env-file=.env.local docs/perf/owner-store-os-complete/recovery/_scroll-chain-probe.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/selective-shell-restore-proof");
mkdirSync(OUT, { recursive: true });

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
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "samarket.vercel.app",
          path: "/",
          secure: true,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
await page.goto(`${ORIGIN}/stores/owner/products/new?storeId=${STORE}`, {
  waitUntil: "domcontentloaded",
  timeout: 90_000,
});
await page.waitForTimeout(3500);
const chain = await page.evaluate(() => {
  const scroll = document.querySelector(".owner-compact-shell__scroll");
  const path = [];
  let el = scroll;
  while (el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    path.push({
      tag: el.tagName,
      id: el.id || undefined,
      cls: (el.className || "").toString().slice(0, 160),
      top: Math.round(r.top),
      h: Math.round(r.height),
      ch: el.clientHeight,
      sh: el.scrollHeight,
      overflowY: cs.overflowY,
      flex: cs.flex,
      minH: cs.minHeight,
      maxH: cs.maxHeight,
      height: cs.height,
      display: cs.display,
    });
    el = el.parentElement;
    if (path.length > 16) break;
  }
  return {
    vh: window.innerHeight,
    bodyOverflow: getComputedStyle(document.body).overflow,
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    dataOwner: document.body.getAttribute("data-owner-compact-shell"),
    path,
  };
});
writeFileSync(resolve(OUT, "scroll-chain-390.json"), JSON.stringify(chain, null, 2));
console.log(JSON.stringify(chain, null, 2));
await browser.close();
