#!/usr/bin/env node
/**
 * TRADE-AUDIT — /market list paint + list tap → /post/[id] detail (3 cycles).
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=qqqq E2E_TEST_PASSWORD=1234 \
 *   node scripts/measure-trade-market-to-post.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycles = Math.max(1, Number(process.env.TRADE_MARKET_POST_CYCLES ?? "3") || 3);
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || process.env.SAMARKET_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const outPath =
  process.env.TRADE_MARKET_POST_OUT || path.join(root, "docs", "perf", "trade-market-to-post-latest.json");
const PERMISSION_GUIDE_PRESEED_KINDS = ["location", "microphone", "speaker"];

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInSession() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const hostname = new URL(baseUrl).hostname;
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.SAMARKET_TEST_PASSWORD ?? "1234";
  const loginIds = [process.env.E2E_TEST_USERNAME?.trim(), "qqqq", "aaaa"].filter(Boolean);
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
    const cookies = [
      {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: hostname,
        path: "/",
        sameSite: "Lax",
        secure: baseUrl.startsWith("https:"),
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: hostname,
          path: "/",
          sameSite: "Lax",
          secure: baseUrl.startsWith("https:"),
        });
      }
    }
    return { cookies, loginId, email };
  }
  throw new Error("signIn failed");
}

function pickMs(snap, key) {
  const v = snap?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

async function readSnap(page) {
  return page.evaluate(() => {
    const w = window;
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

function summarize(samples) {
  if (!samples.length) return { count: 0, min: null, max: null, avg: null, p95: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, n) => a + n, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p95: sorted[p95Idx],
  };
}

async function dismissPermissionGuides(page) {
  const later = page.getByRole("button", { name: /^나중에$|^Later$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await later.first().isVisible({ timeout: 1200 }).catch(() => false))) break;
    await later.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

async function waitDetailPaint(page, startAt) {
  await page.locator("h2").first().waitFor({ state: "visible", timeout: 45_000 });
  const wallMs = Date.now() - startAt;
  await page.waitForTimeout(500);
  const detailSnap = await readSnap(page);
  const detailMs = pickMs(detailSnap, "trade_detail_total_ms");
  const productDetailPaint = pickMs(detailSnap, "product_detail_to_paint_ms");
  return {
    trade_detail_total_ms: detailMs,
    product_detail_to_paint_ms: productDetailPaint,
    tap_to_h2_wall_ms: wallMs,
    navigation_overhead_ms:
      detailMs != null ? Math.max(0, wallMs - detailMs) : null,
  };
}

/** list tap — prefetch window(4s) 후 클릭 */
async function runListTapCycle(page, cycleIndex) {
  await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (cycleIndex === 0) {
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => undefined);
  }
  await dismissPermissionGuides(page);
  const postLink = page.locator('a[href^="/post/"]').first();
  await postLink.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(4000);
  const listSnap = await readSnap(page);
  const listMs =
    pickMs(listSnap, "trade_list_total_ms") ??
    pickMs(listSnap, "trade_list_to_paint_ms") ??
    pickMs(listSnap, "trade_list_hydration_complete_ms");

  const tapAt = Date.now();
  await postLink.click();
  await page.waitForURL(/\/post\//, { timeout: 45_000 });
  const detail = await waitDetailPaint(page, tapAt);
  return {
    scenario: "list_tap_prefetch_wait",
    cycle: cycleIndex + 1,
    post_url: page.url(),
    trade_list_ms: listMs,
    ...detail,
  };
}

/** direct goto — list 경유·탭 전환 없이 동일 post URL */
async function runDirectCycle(page, cycleIndex, postUrl) {
  const navAt = Date.now();
  await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dismissPermissionGuides(page);
  const detail = await waitDetailPaint(page, navAt);
  return {
    scenario: "direct_goto_post",
    cycle: cycleIndex + 1,
    post_url: page.url(),
    trade_list_ms: null,
    ...detail,
  };
}

async function main() {
  const auth = await signInSession();
  console.log(`auth: ${auth.email}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(auth.cookies);
  await context.addInitScript((kinds) => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      localStorage.setItem("samarket.app.language", "ko");
      for (const k of kinds) {
        localStorage.setItem(`dibay.permission.${k}.guideSeen`, "1");
      }
    } catch {
      /* ignore */
    }
  }, PERMISSION_GUIDE_PRESEED_KINDS);
  const page = await context.newPage();

  const listTapResults = [];
  const directResults = [];
  const errors = [];
  let postUrl = "";
  try {
    for (let c = 0; c < cycles; c += 1) {
      try {
        const row = await runListTapCycle(page, c);
        listTapResults.push(row);
        if (!postUrl && row.post_url) postUrl = row.post_url;
      } catch (error) {
        errors.push({ scenario: "list_tap", cycle: c + 1, message: String(error).slice(0, 500) });
      }
    }
    if (postUrl) {
      for (let c = 0; c < cycles; c += 1) {
        try {
          directResults.push(await runDirectCycle(page, c, postUrl));
        } catch (error) {
          errors.push({ scenario: "direct_goto", cycle: c + 1, message: String(error).slice(0, 500) });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const warmList = listTapResults.slice(1);
  const warmDirect = directResults.slice(1);
  const pickWarm = (rows, key) => summarize(rows.map((r) => r[key]).filter((n) => n != null));

  const report = {
    measured_at: new Date().toISOString(),
    base_url: baseUrl,
    cycles,
    warm_discard: "cycle 1 per scenario",
    post_url: postUrl || null,
    hypothesis:
      "trade_detail_total_ms = server RSC only; tap_to_h2_wall − trade_detail = client navigation/flight overhead",
    list_tap_prefetch_wait: {
      trade_detail_total_ms_warm: pickWarm(warmList, "trade_detail_total_ms"),
      tap_to_h2_wall_ms_warm: pickWarm(warmList, "tap_to_h2_wall_ms"),
      navigation_overhead_ms_warm: pickWarm(warmList, "navigation_overhead_ms"),
      cycles_detail: listTapResults,
    },
    direct_goto_post: {
      trade_detail_total_ms_warm: pickWarm(warmDirect, "trade_detail_total_ms"),
      tap_to_h2_wall_ms_warm: pickWarm(warmDirect, "tap_to_h2_wall_ms"),
      navigation_overhead_ms_warm: pickWarm(warmDirect, "navigation_overhead_ms"),
      cycles_detail: directResults,
    },
    errors,
    reference: {
      prior_baseline_dev_ms: 177,
      audit1_warm_detail_p95: 558,
      audit1_warm_wall_p95: 1527,
      doc: "docs/trade-c2c-perf-baseline.md",
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("TRADE_MARKET_POST_JSON:", JSON.stringify(report));
  console.log(`wrote ${path.relative(root, outPath)}`);
  process.exit(errors.length && !listTapResults.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
