#!/usr/bin/env node
/**
 * Extended CM rebind verify — phase-segmented console capture.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/verify-cm-realtime-rebind-runtime-extended.mjs
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
    return { family: "stable-sub", tag: m?.[1] ?? "unknown", raw: t };
  }
  if (t.includes("[cm-rt-room-sub]")) {
    const m = t.match(/\[cm-rt-room-sub\]\s+(\S+)/);
    const source = t.includes("home_diag_snapshot") ? "diag_snapshot" : "physical_bind";
    return { family: "room-sub", tag: m?.[1] ?? "unknown", source, raw: t };
  }
  if (t.includes("[rt-rebind-trace]")) {
    const reason = t.match(/reason:\s*['"]?([^'",}\s]+)/)?.[1] ?? "unknown";
    return { family: "rt-rebind", tag: reason, raw: t };
  }
  if (t.includes("[rt-room-diff]")) return { family: "rt-room-diff", tag: "diff", raw: t };
  if (t.includes("[rt-channel-lifecycle]")) return { family: "rt-channel-lifecycle", tag: "lifecycle", raw: t };
  return null;
}

function maxBurst(events, windowMs = 2000) {
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

function countInPhase(entries, phase, pred) {
  return entries.filter((e) => e.phase === phase && pred(e)).length;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const auth = await signInSupabaseCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (auth?.cookies) await context.addCookies(auth.cookies);
  const page = await context.newPage();

  const entries = [];
  let phase = "init";
  page.on("console", (msg) => {
    const text = msg.text();
    const parsed = parseConsoleEntry(text);
    if (parsed) entries.push({ ...parsed, ts: Date.now(), phase, type: msg.type() });
  });

  const mark = async (name, fn) => {
    phase = name;
    await fn();
    await page.waitForTimeout(phase === "visibility" ? 1200 : 1800);
  };

  await mark("home_entry", async () => {
    await page.goto(`${BASE}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2000);
  });

  await mark("pillar_scroll", async () => {
    await page.evaluate(() => {
      const scrollables = [...document.querySelectorAll("[data-scroll-root], main, [role='list'], .overflow-y-auto")];
      for (const el of scrollables) {
        if (el.scrollHeight > el.clientHeight + 40) {
          el.scrollTop = Math.min(el.scrollHeight, el.clientHeight * 2);
        }
      }
      window.scrollBy(0, 600);
    });
  });

  await mark("pillar_trade", async () => {
    const link = page.locator('a[href*="pillar=trade"], a[href*="/community-messenger/trade"]').first();
    if (await link.count()) await link.click({ timeout: 8000 }).catch(() => null);
  });

  await mark("pillar_delivery", async () => {
    const link = page.locator('a[href*="pillar=delivery"], a[href*="/community-messenger/delivery"]').first();
    if (await link.count()) await link.click({ timeout: 8000 }).catch(() => null);
  });

  await mark("room_enter", async () => {
    const roomLink = page.locator('a[href*="/community-messenger/rooms/"]').first();
    if (await roomLink.count()) await roomLink.click({ timeout: 15_000 }).catch(() => null);
  });

  await mark("room_back", async () => {
    if (page.url().includes("/community-messenger/rooms/")) {
      await page.goBack({ timeout: 15_000 }).catch(() => null);
    }
  });

  await mark("visibility", async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      window.dispatchEvent(new Event("focus"));
    });
  });

  await browser.close();

  const rebindStarts = entries.filter((e) => e.tag === "channel_rebind_start");
  const physicalSub = entries.filter((e) => e.tag === "subscribed_message_room_ids" && e.source === "physical_bind");
  const diagSub = entries.filter((e) => e.tag === "subscribed_message_room_ids" && e.source === "diag_snapshot");
  const skipUnchanged = entries.filter((e) => e.tag === "room_bundle_skip_unchanged");
  const noopDiffSkip = entries.filter((e) => e.family === "rt-room-diff" && e.raw.includes("added: Array(0)") && e.raw.includes("removed: Array(0)"));
  const diffRebind = entries.filter((e) => e.tag === "room_bundle_rebind" || (e.tag === "channel_rebind_start" && e.phase !== "home_entry"));
  const burst2s = maxBurst(rebindStarts, 2000);
  const burst5s = maxBurst(rebindStarts, 5000);

  const phaseRebind = Object.fromEntries(
    [...new Set(entries.map((e) => e.phase))].map((p) => [
      p,
      countInPhase(entries, p, (e) => e.tag === "channel_rebind_start"),
    ])
  );

  const pass =
    burst2s <= 2 &&
    burst5s <= 4 &&
    rebindStarts.length <= 12 &&
    phaseRebind.pillar_scroll === 0 &&
    phaseRebind.visibility === 0 &&
    phaseRebind.room_back === 0 &&
    !(rebindStarts.length >= 6 && physicalSub.length >= 6 && burst2s >= 3);

  const report = {
    measured_at: new Date().toISOString(),
    base_url: BASE,
    is_dev: BASE.includes("3001"),
    counts: {
      channel_rebind_start_total: rebindStarts.length,
      channel_rebind_burst_2s_max: burst2s,
      channel_rebind_burst_5s_max: burst5s,
      subscribed_message_room_ids_physical_bind: physicalSub.length,
      subscribed_message_room_ids_diag_snapshot: diagSub.length,
      fingerprint_changed: entries.filter((e) => e.tag === "fingerprint_changed").length,
      room_bundle_skip_unchanged: skipUnchanged.length,
      room_bundle_rebind: entries.filter((e) => e.tag === "room_bundle_rebind").length,
      rt_room_diff: entries.filter((e) => e.family === "rt-room-diff").length,
      rt_channel_lifecycle: entries.filter((e) => e.family === "rt-channel-lifecycle").length,
    },
    phase_channel_rebind_start: phaseRebind,
    navigation_result: {
      room_enter_rebind: phaseRebind.room_enter ?? 0,
      room_back_rebind: phaseRebind.room_back ?? 0,
      pillar_trade_rebind: phaseRebind.pillar_trade ?? 0,
      pillar_delivery_rebind: phaseRebind.pillar_delivery ?? 0,
    },
    visibility_focus_result: {
      visibility_phase_rebind: phaseRebind.visibility ?? 0,
      skip_unchanged_in_visibility: countInPhase(entries, "visibility", (e) => e.tag === "room_bundle_skip_unchanged"),
    },
    pass,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
