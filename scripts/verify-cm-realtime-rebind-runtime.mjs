#!/usr/bin/env node
/**
 * CM Realtime rebind runtime verify — Playwright console capture.
 * Prereq: npm run build && npm run start  (prod: [cm-rt-stable-sub] / [cm-rt-room-sub])
 * Dev traces ([rt-rebind-trace] etc.) require npm run dev — see report note.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

async function signInSupabaseCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const loginId of loginIds) {
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    return {
      cookies: [
        {
          name: `sb-${ref}-auth-token`,
          value: encodeURIComponent(JSON.stringify(session)),
          domain: "127.0.0.1",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
    };
  }
  return null;
}

function parseConsoleEntry(text) {
  const t = text ?? "";
  if (t.includes("[cm-rt-stable-sub]")) {
    const m = t.match(/\[cm-rt-stable-sub\]\s+(\S+)/);
    return { kind: "stable-sub", tag: m?.[1] ?? "unknown", raw: t };
  }
  if (t.includes("[cm-rt-room-sub]")) {
    const m = t.match(/\[cm-rt-room-sub\]\s+(\S+)/);
    return { kind: "room-sub", tag: m?.[1] ?? "unknown", raw: t };
  }
  if (t.includes("[rt-rebind-trace]")) return { kind: "rt-rebind", raw: t };
  if (t.includes("[rt-room-diff]")) return { kind: "rt-room-diff", raw: t };
  if (t.includes("[rt-channel-lifecycle]")) return { kind: "rt-channel-lifecycle", raw: t };
  if (t.includes("room_bundle_skip_unchanged")) return { kind: "rt-rebind", tag: "room_bundle_skip_unchanged", raw: t };
  return null;
}

function maxBurstInWindow(events, windowMs = 2000) {
  if (events.length === 0) return 0;
  const ts = events.map((e) => e.ts);
  let max = 0;
  for (let i = 0; i < ts.length; i++) {
    let j = i;
    while (j < ts.length && ts[j] - ts[i] <= windowMs) j++;
    max = Math.max(max, j - i);
  }
  return max;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const auth = await signInSupabaseCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (auth?.cookies) await context.addCookies(auth.cookies);
  const page = await context.newPage();

  const entries = [];
  page.on("console", (msg) => {
    const text = msg.text();
    const parsed = parseConsoleEntry(text);
    if (parsed) entries.push({ ...parsed, ts: Date.now(), type: msg.type() });
  });

  const gotoMessenger = async () => {
    await page.goto(`${BASE}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(3500);
  };

  await gotoMessenger();

  // pillar scroll simulation
  await page.evaluate(() => {
    const scrollables = [...document.querySelectorAll("[data-scroll-root], main, [role='list'], .overflow-y-auto")];
    for (const el of scrollables) {
      if (el.scrollHeight > el.clientHeight + 40) {
        el.scrollTop = Math.min(el.scrollHeight, el.clientHeight * 2);
      }
    }
    window.scrollBy(0, 600);
  });
  await page.waitForTimeout(1500);

  // trade pillar if link exists
  const tradeLink = page.locator('a[href*="pillar=trade"], a[href*="/community-messenger/trade"]').first();
  if (await tradeLink.count()) {
    await tradeLink.click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(2000);
  }

  // delivery pillar
  const deliveryLink = page.locator('a[href*="pillar=delivery"], a[href*="/community-messenger/delivery"]').first();
  if (await deliveryLink.count()) {
    await deliveryLink.click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(2000);
  }

  // enter first room
  const roomLink = page.locator('a[href*="/community-messenger/rooms/"]').first();
  let enteredRoom = false;
  if (await roomLink.count()) {
    await roomLink.click({ timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(2500);
    enteredRoom = page.url().includes("/community-messenger/rooms/");
  }

  if (enteredRoom) {
    await page.goBack({ timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(2000);
  }

  // visibility + pageshow + focus
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(2000);

  await browser.close();

  const rebindStarts = entries.filter((e) => e.tag === "channel_rebind_start");
  const subscribedLogs = entries.filter((e) => e.tag === "subscribed_message_room_ids");
  const fingerprintChanged = entries.filter((e) => e.tag === "fingerprint_changed");
  const rtRebind = entries.filter((e) => e.kind === "rt-rebind");
  const rtRoomDiff = entries.filter((e) => e.kind === "rt-room-diff");
  const skipUnchanged = rtRebind.filter((e) => e.raw.includes("room_bundle_skip_unchanged"));
  const burst2s = maxBurstInWindow(rebindStarts, 2000);
  const burst5s = maxBurstInWindow(rebindStarts, 5000);

  const pass =
    burst2s <= 2 &&
    burst5s <= 4 &&
    rebindStarts.length <= 12 &&
    !(rebindStarts.length >= 6 && subscribedLogs.length >= 6 && burst2s >= 3);

  const report = {
    measured_at: new Date().toISOString(),
    scenario: "community-messenger home pillar scroll / room / back / visibility",
    base_url: BASE,
    note: "Production start: [rt-rebind-trace]/[rt-room-diff] are dev-only (no-op). Use cm-rt-stable-sub metrics.",
    counts: {
      channel_rebind_start: rebindStarts.length,
      channel_rebind_burst_2s_max: burst2s,
      channel_rebind_burst_5s_max: burst5s,
      subscribed_message_room_ids: subscribedLogs.length,
      fingerprint_changed: fingerprintChanged.length,
      rt_rebind_trace: rtRebind.length,
      rt_room_diff: rtRoomDiff.length,
      room_bundle_skip_unchanged: skipUnchanged.length,
    },
    sample_rebind_starts: rebindStarts.slice(0, 8).map((e) => e.raw.slice(0, 200)),
    pass,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
