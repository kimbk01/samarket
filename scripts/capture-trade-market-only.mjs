#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1).trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = url.match(/https:\/\/([^.]+)\./)[1];
const { data } = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({
  email: "qqqq@manual.local",
  password: "1234",
});
const session = {
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
  expires_at: data.session.expires_at,
  expires_in: data.session.expires_in,
  token_type: data.session.token_type,
  user: data.session.user,
};
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  {
    name: `sb-${ref}-auth-token`,
    value: encodeURIComponent(JSON.stringify(session)),
    domain: "localhost",
    path: "/",
    sameSite: "Lax",
  },
]);
await context.addInitScript(() => sessionStorage.setItem("samarket:debug:runtime", "1"));
const page = await context.newPage();
await page.goto("http://localhost:3000/market", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
const m = (await page.evaluate(() => window.getMessengerHomeVerificationSnapshot?.()))?.appWidePhaseLastMs ?? {};
const trade = Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith("trade_")));
console.log(JSON.stringify(trade, null, 2));
await browser.close();
